import "server-only";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { deliverPush } from "@/lib/notifications/push";
import { enqueueNotificationEmail } from "@/lib/notifications/email-queue";
import { logger } from "@/lib/logger";
import { runAfterResponse } from "@/lib/after-response";

export type NotifyInput = {
  eventKey?: string;
  userId: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  /**
   * Project title for context, when the notification is about work in a
   * specific project. Rendered as a context line in-app and in email, and
   * appended to the push body. Persisted into `data.project` so the bell and
   * list can show it without extra queries.
   */
  project?: string;
  data?: unknown;
  /** Set false to keep it in-app only (no email). */
  email?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** In-app + push immediately; optional email is durably queued best-effort. */
export async function notify(input: NotifyInput) {
  // Persist the project alongside any caller-provided data so the in-app bell
  // and list can show it without an extra query per notification.
  const storedData =
    input.project != null
      ? { ...(isRecord(input.data) ? input.data : {}), project: input.project }
      : (input.data ?? null);

  const [created] = await db
    .insert(notifications)
    .values({
      eventKey: input.eventKey,
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link,
      data: storedData,
    })
    .onConflictDoNothing()
    .returning({ id: notifications.id });

  if (!created) return;

  // Push can't render a separate context line, so fold the project into the
  // body: "Edit chapter 3 · The Trinity".
  const pushBody = input.project
    ? [input.body, input.project].filter(Boolean).join(" · ")
    : input.body;

  // Web push is its own channel (fires regardless of the email flag); all
  // gating lives in deliverPush. Best-effort and detached so it never adds
  // push-network latency to the triggering action, but tracked with `after()`
  // so a host that suspends the instance right after the response still lets
  // it finish.
  runAfterResponse("push delivery", () =>
    deliverPush(input.userId, {
      type: input.type,
      title: input.title,
      body: pushBody,
      url: input.link,
      tag: input.link ?? input.type,
    })
  );

  if (input.email === false || !created) return;
  try {
    await enqueueNotificationEmail({
      notificationId: created.id,
      recipientId: input.userId,
      type: input.type,
    });
  } catch (err) {
    logger.error("notification email enqueue failed", err);
  }
}

export async function notifyMany(userIds: string[], input: Omit<NotifyInput, "userId">) {
  const unique = [...new Set(userIds)];
  await Promise.all(unique.map((userId) => notify({ ...input, userId })));
}

/** Remove "task overdue" notifications for a task (e.g. once it's marked done). */
export async function clearOverdueNotifications(taskId: string) {
  return clearOverdueNotificationsForTasks([taskId]);
}

/** Remove stale overdue notifications for one or more rescheduled tasks. */
export async function clearOverdueNotificationsForTasks(
  taskIds: readonly string[]
) {
  const uniqueIds = [...new Set(taskIds.filter(Boolean))];
  if (uniqueIds.length === 0) return 0;
  const deleted = await db
    .delete(notifications)
    .where(
      and(
        eq(notifications.type, "task_overdue"),
        inArray(sql<string>`(${notifications.data} ->> 'taskId')`, uniqueIds)
      )
    )
    .returning({ id: notifications.id });
  return deleted.length;
}

/** Resolve every manager's suggestion once a thread has been linked. */
export async function clearPossibleProjectNotifications(threadId: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.type, "possible_new_project"),
        sql`(${notifications.data} ->> 'threadId') = ${threadId}`
      )
    );
  revalidatePath("/dashboard");
}

export async function clearPossibleCounterpartyNotifications(threadId: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.type, "possible_counterparty"),
        sql`(${notifications.data} ->> 'threadId') = ${threadId}`
      )
    );
  revalidatePath("/dashboard");
}

/** Resolve every manager's grant-reminder suggestion for a thread. */
export async function clearPossibleGrantReminderNotifications(threadId: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.type, "possible_grant_reminder"),
        sql`(${notifications.data} ->> 'threadId') = ${threadId}`
      )
    );
  revalidatePath("/dashboard");
}
