/**
 * Central authorization policy. Pure (no server-only, no DB) so both server
 * pages and client components can consult it, and so it's table-testable.
 *
 * Model (deliberate, single trusting team): roles are WORKSPACE-level
 * (super admin > admin > manager > member). Every capability below currently requires
 * manager+ — the point of this module is the single seam: if a capability ever
 * diverges (e.g. per-project managers, member-editable tasks boards), it
 * changes here once, not across a dozen pages.
 *
 * Explicitly out of scope: per-project membership authority. `projectMembers`
 * describes who does what work, not who may edit. Changing that is a product
 * decision; `assertProjectAccess` in guards.ts is the other half of that seam.
 */

export type TeamRole = "super_admin" | "admin" | "manager" | "member";

export const ROLE_RANK: Record<TeamRole, number> = {
  member: 0,
  manager: 1,
  admin: 2,
  super_admin: 3,
};

export type Capability =
  | "workspace.manage" // team/settings surfaces, nav to manager areas
  | "wiki.view" // private workspace knowledge is available to active teammates
  | "wiki.edit" // publishing stable workspace knowledge stays manager-controlled
  | "project.edit" // project settings, phases, members
  | "tasks.manage" // create/assign tasks beyond one's own
  | "budget.edit"
  | "rights.edit"
  | "print.manage"
  | "correspondence.view" // captured email is sensitive operational data
  | "chat.createChannel"
  | "chat.manageMembers"
  | "standups.manage"
  | "comments.moderate"
  | "reports.export"
  | "donations.manage" // donor identity, imports, allocations (admin only)
  | "costs.view" // provider usage, estimates, and spend controls (admin only)
  | "ai.configure" // model routing and assistant learning (admin only)
  | "ai.experimental" // turning experimental AI providers on/off (super admin only)
  | "security.monitor"; // dependency security status and alert ownership (super admin only)

const MIN_ROLE: Record<Capability, TeamRole> = {
  "workspace.manage": "manager",
  "wiki.view": "member",
  "wiki.edit": "manager",
  "project.edit": "manager",
  "tasks.manage": "manager",
  "budget.edit": "manager",
  "rights.edit": "manager",
  "print.manage": "manager",
  "correspondence.view": "manager",
  "chat.createChannel": "manager",
  "chat.manageMembers": "manager",
  "standups.manage": "manager",
  "comments.moderate": "manager",
  "reports.export": "manager",
  "donations.manage": "admin",
  "costs.view": "admin",
  "ai.configure": "admin",
  "ai.experimental": "super_admin",
  "security.monitor": "super_admin",
};

export function asTeamRole(role: string | null | undefined): TeamRole | null {
  return role === "super_admin" ||
    role === "admin" ||
    role === "manager" ||
    role === "member"
    ? role
    : null;
}

/** Whether a role may exercise a capability. Unknown roles can do nothing. */
export function can(
  user: string | { role?: string | null } | null | undefined,
  capability: Capability
): boolean {
  const raw = typeof user === "string" ? user : user?.role;
  const role = asTeamRole(raw);
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[MIN_ROLE[capability]];
}

/** Shorthand for the most common check (admin or manager). */
export function canManage(
  user: string | { role?: string | null } | null | undefined
): boolean {
  return can(user, "workspace.manage");
}

/** Admin-level access, including the super-admin role. */
export function isAdminRole(
  user: string | { role?: string | null } | null | undefined
): boolean {
  const raw = typeof user === "string" ? user : user?.role;
  const role = asTeamRole(raw);
  return role !== null && ROLE_RANK[role] >= ROLE_RANK.admin;
}

export function isSuperAdminRole(
  user: string | { role?: string | null } | null | undefined
): boolean {
  const raw = typeof user === "string" ? user : user?.role;
  return asTeamRole(raw) === "super_admin";
}

export function canAssignTeamRole(
  actor: string | { role?: string | null } | null | undefined,
  desiredRole: string | null | undefined
): boolean {
  const raw = typeof actor === "string" ? actor : actor?.role;
  const actorRole = asTeamRole(raw);
  const desired = asTeamRole(desiredRole);
  return (
    actorRole !== null &&
    desired !== null &&
    ROLE_RANK[actorRole] >= ROLE_RANK[desired]
  );
}

export function canManageTeamRole(
  actor: string | { role?: string | null } | null | undefined,
  targetRole: string | null | undefined
): boolean {
  const raw = typeof actor === "string" ? actor : actor?.role;
  const actorRole = asTeamRole(raw);
  const target = asTeamRole(targetRole);
  return (
    actorRole !== null &&
    target !== null &&
    (ROLE_RANK[actorRole] > ROLE_RANK[target] ||
      (actorRole === "super_admin" && target === "super_admin"))
  );
}
