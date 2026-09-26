"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { isValidTimeZone } from "@/lib/timezone";

import { auth } from "@/lib/auth/auth";
import { requireRole, requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import {
  emailPreferences,
  files,
  invitations,
  user,
  userAvatars,
} from "@/lib/db/schema";
import { sendInviteEmail } from "@/lib/email/invite";
import { assertSeatAvailable } from "@/lib/hosted/entitlements";
import { reschedulePendingEmailRows } from "@/lib/notifications/email-queue";
import { deleteObject } from "@/lib/r2";
import { generateToken, hashToken } from "@/lib/tokens";
import {
  createProvisioningGrant,
  PROVISIONING_HEADER,
} from "@/lib/auth/provisioning";
import { decodeAvatarDataUrl } from "@/lib/users/avatar-data";
import { getInvitationByToken } from "./queries";
import { getWorkspaceSettings } from "@/lib/workspace/queries";
import {
  canAssignTeamRole,
  canManageTeamRole,
} from "@/lib/auth/policy";

const roleEnum = z.enum(["super_admin", "admin", "manager", "member"]);

export type TeamState = {
  error?: string;
  ok?: boolean;
  /** Set when the invite was saved but the email couldn't be delivered. */
  emailFailed?: boolean;
  /** The invite link — returned so an admin can share it manually if email fails. */
  inviteUrl?: string;
  fieldErrors?: Record<string, string>;
};

const INVITE_TTL_DAYS = 7;

export async function inviteMember(
  _prev: TeamState,
  formData: FormData
): Promise<TeamState> {
  const { user: actor } = await requireRole("manager");

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const roleParse = roleEnum.safeParse(formData.get("role"));
  const emailParse = z.string().email().safeParse(email);
  if (!emailParse.success) return { error: "Enter a valid email address." };
  if (!roleParse.success) return { error: "Pick a role." };
  const role = roleParse.data;
  if (!canAssignTeamRole(actor, role)) {
    return { error: "You cannot invite someone into a role above your own." };
  }

  const [existing] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (existing) return { error: "That person already has an account." };

  const [pendingInvitation] = await db
    .select({ role: invitations.role })
    .from(invitations)
    .where(and(eq(invitations.email, email), isNull(invitations.acceptedAt)))
    .limit(1);
  if (
    pendingInvitation &&
    !canAssignTeamRole(actor, pendingInvitation.role)
  ) {
    return {
      error: "You cannot replace an invitation above your role.",
    };
  }

  // A re-sent invitation replaces one that already holds a seat.
  const seat = await assertSeatAvailable(pendingInvitation ? 1 : 0);
  if (!seat.ok) return { error: seat.error };

  // Replace any prior pending invite for this email.
  await db
    .delete(invitations)
    .where(and(eq(invitations.email, email), isNull(invitations.acceptedAt)));

  const rawToken = generateToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000);
  await db.insert(invitations).values({
    email,
    role,
    tokenHash: hashToken(rawToken),
    invitedBy: actor.id,
    expiresAt,
  });

  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const inviteUrl = `${base}/invite/${rawToken}`;
  try {
    const workspace = await getWorkspaceSettings();
    await sendInviteEmail({
      to: email,
      inviteUrl,
      role,
      invitedByName: actor.name,
      workspaceName: workspace.orgName,
    });
  } catch {
    // The invite is saved; email delivery failed (e.g. SMTP unreachable). Hand the
    // link back so it can be shared manually instead of leaving the invite stranded.
    revalidatePath("/settings/team");
    return { ok: true, emailFailed: true, inviteUrl };
  }

  revalidatePath("/settings/team");
  return { ok: true };
}

export async function revokeInvitation(id: string) {
  const { user: actor } = await requireRole("manager");
  const [invitation] = await db
    .select({ role: invitations.role })
    .from(invitations)
    .where(eq(invitations.id, id))
    .limit(1);
  if (
    invitation &&
    !canAssignTeamRole(actor, invitation.role)
  ) {
    return { error: "You cannot revoke an invitation above your role." };
  }
  await db.delete(invitations).where(eq(invitations.id, id));
  revalidatePath("/settings/team");
  return { ok: true };
}

export async function setUserRole(userId: string, role: string) {
  const { user: actor } = await requireRole("admin");
  const r = roleEnum.parse(role);
  if (userId === actor.id) {
    return { error: "You cannot change your own workspace role." };
  }
  const [target] = await db
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!target) return { error: "That teammate no longer exists." };

  if (
    !canManageTeamRole(actor, target.role) ||
    !canAssignTeamRole(actor, r)
  ) {
    return { error: "You cannot change this teammate’s role." };
  }
  await db.update(user).set({ role: r }).where(eq(user.id, userId));
  revalidatePath("/settings/team");
  return { ok: true };
}

export async function setUserActive(userId: string, active: boolean) {
  const { user: actor } = await requireRole("admin");
  if (userId === actor.id) {
    return { error: "You cannot deactivate your own account." };
  }
  const [target] = await db
    .select({ role: user.role, isActive: user.isActive })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (
    !target ||
    !canManageTeamRole(actor, target.role)
  ) {
    return { error: "You cannot change this teammate’s access." };
  }
  if (active && !target.isActive) {
    const seat = await assertSeatAvailable();
    if (!seat.ok) return { error: seat.error };
  }
  await db.update(user).set({ isActive: active }).where(eq(user.id, userId));
  revalidatePath("/settings/team");
  return { ok: true };
}

export type AcceptState = { error?: string };

export async function acceptInvite(
  _prev: AcceptState,
  formData: FormData
): Promise<AcceptState> {
  const token = String(formData.get("token") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!name) return { error: "Enter your name." };
  if (password.length < 8)
    return { error: "Password must be at least 8 characters." };

  const invite = await getInvitationByToken(token);
  if (!invite) return { error: "This invite is invalid or has expired." };

  try {
    const requestHeaders = new Headers(await headers());
    requestHeaders.set(
      PROVISIONING_HEADER,
      createProvisioningGrant(invite.email, "invite")
    );
    await auth.api.signUpEmail({
      body: { name, email: invite.email, password },
      headers: requestHeaders,
    });
  } catch {
    return { error: "Could not create your account. Try again." };
  }

  redirect("/dashboard");
}

const profileSchema = z.object({
  name: z.string().trim().min(1).max(120),
  timezone: z.string().trim().refine(isValidTimeZone, "Choose a valid timezone."),
});

export async function updateProfile(
  _prev: TeamState,
  formData: FormData
): Promise<TeamState> {
  const { user: actor } = await requireUser();
  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    timezone: formData.get("timezone"),
  });
  if (!parsed.success) return { error: "Check your profile details.", fieldErrors: Object.fromEntries(parsed.error.issues.map(issue => [String(issue.path[0]), issue.message])) };
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(user)
      .set({ name: parsed.data.name, timezone: parsed.data.timezone })
      .where(eq(user.id, actor.id));
    const [prefs] = await tx
      .select()
      .from(emailPreferences)
      .where(eq(emailPreferences.userId, actor.id))
      .limit(1);
    if (prefs) {
      await reschedulePendingEmailRows(tx, {
        userId: actor.id,
        mode:
          prefs.emailDeliveryMode === "daily" ||
          prefs.emailDeliveryMode === "immediate"
            ? prefs.emailDeliveryMode
            : "bundled",
        digestTimeMinutes: prefs.emailDigestTimeMinutes,
        timezone: parsed.data.timezone,
        now,
      });
    }
  });
  revalidatePath("/settings/profile");
  return { ok: true };
}

/**
 * Set or clear the current user's avatar. Cropped WebP bytes live with the user
 * record instead of external file storage so profile identity remains available
 * even if workspace R2 storage is reconfigured or unavailable.
 */
export async function setProfileImage(dataUrl: string | null): Promise<void> {
  const { user: actor } = await requireUser();
  const avatar = dataUrl ? decodeAvatarDataUrl(dataUrl) : null;

  const [current] = await db
    .select({ image: user.image })
    .from(user)
    .where(eq(user.id, actor.id))
    .limit(1);
  const previous = current?.image ?? null;
  const updatedAt = new Date();
  const image = avatar
    ? `/api/users/${encodeURIComponent(actor.id)}/avatar?v=${updatedAt.getTime()}`
    : null;

  await db.transaction(async (tx) => {
    await tx
      .update(user)
      .set({ image, updatedAt })
      .where(eq(user.id, actor.id));

    if (avatar) {
      await tx
        .insert(userAvatars)
        .values({
          userId: actor.id,
          data: avatar.base64,
          mimeType: avatar.mimeType,
          updatedAt,
        })
        .onConflictDoUpdate({
          target: userAvatars.userId,
          set: {
            data: avatar.base64,
            mimeType: avatar.mimeType,
            updatedAt,
          },
        });
    } else {
      await tx.delete(userAvatars).where(eq(userAvatars.userId, actor.id));
    }
  });

  // Clean up a legacy R2-backed avatar after the durable copy is saved. Delete
  // the metadata first so a missing object cannot leave a stale ready file row.
  if (previous && !/^https?:|^\//.test(previous)) {
    try {
      const [old] = await db
        .select()
        .from(files)
        .where(and(eq(files.id, previous), eq(files.uploadedBy, actor.id)))
        .limit(1);
      if (old) {
        await db.delete(files).where(eq(files.id, old.id));
        await deleteObject(old.r2Key).catch(() => undefined);
      }
    } catch {
      // Ignore legacy cleanup; the new database-backed avatar is already saved.
    }
  }

  revalidatePath("/settings/profile");
  revalidatePath("/", "layout");
}

const HOURS = z.coerce.number().int().min(0).max(168);

/** Manager-set weekly capacity (hours) for a teammate — drives utilization. */
export async function updateUserWeeklyHours(userId: string, hours: number) {
  await requireRole("manager");
  const h = HOURS.parse(hours);
  await db.update(user).set({ weeklyHours: h }).where(eq(user.id, userId));
  revalidatePath("/settings/team");
}
