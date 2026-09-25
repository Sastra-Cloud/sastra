"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";

import { z } from "zod";

import { requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { emailPreferences, notifications, pushSubscriptions } from "@/lib/db/schema";
import { deliverTestPush } from "@/lib/notifications/push";
import { workToQuietWindow } from "@/lib/notifications/work-hours";
import { generateToken } from "@/lib/tokens";
import type { ActionResult } from "@/lib/actions/result";
import {
  EMAIL_DELIVERY_MODES,
  type EmailDeliveryMode,
} from "@/lib/notifications/email-policy";
import {
  reschedulePendingEmailRows,
  suppressPendingEmailCategory,
  unsubscribeNotificationEmail,
} from "@/lib/notifications/email-queue";

export async function markNotificationRead(id: string) {
  const { user } = await requireUser();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, user.id)));
  revalidatePath("/notifications");
}

export async function markAllNotificationsRead() {
  const { user } = await requireUser();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(eq(notifications.userId, user.id), isNull(notifications.readAt))
    );
  revalidatePath("/notifications");
}

/** Unsubscribe by token (no session — the token authorizes). Used by email links. */
export async function unsubscribeByToken(
  token: string,
  category: "workflow" | "standup" | "all"
) {
  await unsubscribeNotificationEmail(token, category);
}

/** Form action for the human-facing unsubscribe page. */
export async function submitUnsubscribe(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const rawCategory = String(formData.get("category") ?? "workflow");
  const category = rawCategory === "all"
    ? "all"
    : rawCategory === "standup"
      ? "standup"
      : "workflow";
  await unsubscribeByToken(token, category);
  redirect("/unsubscribe?done=1");
}

/** Toggle a per-category email preference (lazily creating the row + token). */
export async function setEmailPreference(
  category: "workflow" | "standup",
  enabled: boolean
) {
  const { user } = await requireUser();
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .insert(emailPreferences)
      .values({
        userId: user.id,
        unsubscribeToken: generateToken(),
        workflowOptIn: category === "workflow" ? enabled : true,
        standupOptIn: category === "standup" ? enabled : true,
      })
      .onConflictDoUpdate({
        target: emailPreferences.userId,
        set:
          category === "workflow"
            ? { workflowOptIn: enabled, updatedAt: now }
            : { standupOptIn: enabled, updatedAt: now },
      });
    if (!enabled) {
      await suppressPendingEmailCategory(tx, user.id, category, now);
    }
  });
  revalidatePath("/settings/notifications");
}

const emailDeliverySchema = z.object({
  mode: z.enum(EMAIL_DELIVERY_MODES),
  digestTimeMinutes: z.coerce.number().int().min(0).max(1439),
});

/** Optimistically save cadence and atomically reschedule all pending email. */
export async function updateEmailDeliverySettings(input: {
  mode: EmailDeliveryMode;
  digestTimeMinutes: number;
}): Promise<ActionResult<{ mode: EmailDeliveryMode; digestTimeMinutes: number }>> {
  const { user } = await requireUser();
  const parsed = emailDeliverySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { message: "Choose a valid email schedule." } };
  }
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .insert(emailPreferences)
      .values({
        userId: user.id,
        unsubscribeToken: generateToken(),
        emailDeliveryMode: parsed.data.mode,
        emailDigestTimeMinutes: parsed.data.digestTimeMinutes,
      })
      .onConflictDoUpdate({
        target: emailPreferences.userId,
        set: {
          emailDeliveryMode: parsed.data.mode,
          emailDigestTimeMinutes: parsed.data.digestTimeMinutes,
          updatedAt: now,
        },
      });
    await reschedulePendingEmailRows(tx, {
      userId: user.id,
      mode: parsed.data.mode,
      digestTimeMinutes: parsed.data.digestTimeMinutes,
      timezone: user.timezone || "UTC",
      now,
    });
  });
  revalidatePath("/settings/notifications");
  return { ok: true, data: parsed.data };
}

/**
 * Send a test push to the current user's registered devices. Progress-based
 * (external delivery), so the client shows a pending label rather than assuming
 * success. Bypasses quiet-hours so the test always arrives.
 */
export async function sendTestPush(): Promise<
  ActionResult<{ sent: number; devices: number }>
> {
  const { user } = await requireUser();
  const result = await deliverTestPush(user.id);
  if (!result.configured) {
    return {
      ok: false,
      error: { message: "Push isn't configured on the server yet." },
    };
  }
  if (result.devices === 0) {
    return {
      ok: false,
      error: { message: "No devices are registered for push yet." },
    };
  }
  if (result.sent === 0) {
    return {
      ok: false,
      error: {
        message:
          "Couldn't reach any device. Try turning notifications off and on again.",
      },
    };
  }
  return { ok: true, data: { sent: result.sent, devices: result.devices } };
}

/** Forget one of the current user's push devices (confirmed-destructive). */
export async function removePushDevice(id: string) {
  const { user } = await requireUser();
  await db
    .delete(pushSubscriptions)
    .where(
      and(eq(pushSubscriptions.id, id), eq(pushSubscriptions.userId, user.id))
    );
  revalidatePath("/settings/notifications");
}

const scheduleSchema = z.object({
  mode: z.enum(["off", "quiet", "work"]),
  quietHoursStart: z.coerce.number().int().min(0).max(1439),
  quietHoursEnd: z.coerce.number().int().min(0).max(1439),
  workHoursStart: z.coerce.number().int().min(0).max(1439),
  workHoursEnd: z.coerce.number().int().min(0).max(1439),
  pushOnlyWhenActive: z.boolean().optional(),
  pushReviewSuggestions: z.boolean().optional(),
  pushPausedUntil: z.string().nullable().optional(),
});

/**
 * Save the push schedule + out-of-office pause (lazily creating the row).
 * `mode` selects how quiet hours are derived: "off" (never quiet), "quiet"
 * (silence the given window), or "work" (silence everything outside work hours).
 * The derived quiet window is stored so the existing push gate keeps working.
 */
export async function updatePushSchedule(input: z.input<typeof scheduleSchema>) {
  const { user } = await requireUser();
  const d = scheduleSchema.parse(input);
  const pausedUntil =
    d.pushPausedUntil && d.pushPausedUntil.length > 0
      ? new Date(d.pushPausedUntil)
      : null;

  const enabled = d.mode !== "off";
  const quiet =
    d.mode === "work"
      ? workToQuietWindow(d.workHoursStart, d.workHoursEnd)
      : { quietStart: d.quietHoursStart, quietEnd: d.quietHoursEnd };
  const onlyWhenActive = d.pushOnlyWhenActive ?? false;
  const reviewSuggestions = d.pushReviewSuggestions ?? false;

  const values = {
    quietHoursEnabled: enabled,
    quietHoursStart: quiet.quietStart,
    quietHoursEnd: quiet.quietEnd,
    pushScheduleMode: d.mode,
    workHoursStart: d.workHoursStart,
    workHoursEnd: d.workHoursEnd,
    pushOnlyWhenActive: onlyWhenActive,
    pushReviewSuggestions: reviewSuggestions,
    pushPausedUntil: pausedUntil,
  };

  await db
    .insert(emailPreferences)
    .values({
      userId: user.id,
      unsubscribeToken: generateToken(),
      ...values,
    })
    .onConflictDoUpdate({
      target: emailPreferences.userId,
      set: { ...values, updatedAt: new Date() },
    });
  revalidatePath("/settings/notifications");
}
