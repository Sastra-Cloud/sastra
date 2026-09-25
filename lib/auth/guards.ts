import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { projectMembers } from "@/lib/db/schema";
import { auth } from "./auth";
// Role ranking + capability policy live in lib/auth/policy.ts (pure, testable);
// these guards are the server-side enforcement wrapped around that table.
import {
  can,
  canManage,
  asTeamRole,
  ROLE_RANK,
  type Capability,
  type TeamRole,
} from "./policy";
import { isAdminAssured } from "./assurance";

export type { TeamRole };

/** Resolve the current session (or null). The single source of identity. */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

/** Require a logged-in, active user; redirect to /login otherwise. */
export async function requireUser() {
  const session = await getSession();
  if (!session || !session.user.isActive) {
    redirect("/login");
  }
  return session;
}

/** Require at least the given team role; redirect to dashboard otherwise. */
export async function requireRole(min: TeamRole) {
  const session = await requireUser();
  const role = asTeamRole(session.user.role);
  if (!role || ROLE_RANK[role] < ROLE_RANK[min]) {
    redirect("/dashboard");
  }
  return session;
}

/** Require a named capability so sensitive boundaries stay centralized. */
export async function requireCapability(capability: Capability) {
  const session = await requireUser();
  if (!can(session.user, capability)) redirect("/dashboard");
  return session;
}

/**
 * Require the admin finance capability and a browser renewed by email code or
 * passkey within the last 60 days.
 */
export async function requireDonationAdmin() {
  const session = await requireCapability("donations.manage");
  if (!(await isAdminAssured(session.user.id))) {
    redirect("/security-check?next=%2Fdonations");
  }
  return session;
}

/**
 * Authorization model (deliberate, single trusting team):
 * every authenticated teammate may **view** any project, while **mutations**
 * stay role-gated through `requireRole("manager")`. This helper is the seam for
 * tightening view access later: pass `{ membersOnly: true }` to restrict a page
 * to the project's members (admins/managers always allowed). No caller uses
 * `membersOnly` today, so current behavior is unchanged.
 */
export async function assertProjectAccess(
  projectId: string,
  opts?: { membersOnly?: boolean }
) {
  const session = await requireUser();
  if (!opts?.membersOnly) return session;

  if (canManage(session.user)) return session;

  const [member] = await db
    .select({ id: projectMembers.id })
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, session.user.id)
      )
    )
    .limit(1);
  if (!member) redirect("/dashboard");
  return session;
}
