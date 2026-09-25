import "server-only";

import { and, asc, desc, eq, gt, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { invitations, user } from "@/lib/db/schema";
import { hashToken } from "@/lib/tokens";

export async function listTeamMembers() {
  return db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      role: user.role,
      weeklyHours: user.weeklyHours,
      isActive: user.isActive,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(eq(user.isBot, false))
    .orderBy(asc(user.name));
}

export async function listPendingInvitations() {
  const inviter = user;
  return db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      expiresAt: invitations.expiresAt,
      createdAt: invitations.createdAt,
      invitedByName: inviter.name,
    })
    .from(invitations)
    .leftJoin(inviter, eq(inviter.id, invitations.invitedBy))
    .where(isNull(invitations.acceptedAt))
    .orderBy(desc(invitations.createdAt));
}

/** All project roles incl. inactive (for the roles settings page). */
export async function listAllProjectRoles() {
  const { projectRoles } = await import("@/lib/db/schema");
  return db.select().from(projectRoles).orderBy(asc(projectRoles.sortOrder));
}

/** Validate an invite token; returns email + role if valid & unexpired. */
export async function getInvitationByToken(rawToken: string) {
  const tokenHash = hashToken(rawToken);
  const [invite] = await db
    .select({ email: invitations.email, role: invitations.role })
    .from(invitations)
    .where(
      and(
        eq(invitations.tokenHash, tokenHash),
        isNull(invitations.acceptedAt),
        gt(invitations.expiresAt, new Date())
      )
    )
    .limit(1);
  return invite ?? null;
}
