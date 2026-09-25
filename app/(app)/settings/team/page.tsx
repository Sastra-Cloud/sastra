import { requireRole } from "@/lib/auth/guards";
import {
  listAllProjectRoles,
  listPendingInvitations,
  listTeamMembers,
} from "@/lib/team/queries";
import { listUserRoleCapacity } from "@/lib/capacity/queries";
import { getPlanningDefaults } from "@/lib/planning/queries";
import { getAssistantBudgetMap } from "@/lib/assistant/queries";
import { TeamManager } from "@/components/settings/team-manager";
import { RoleCapacityMatrix } from "@/components/settings/role-capacity-matrix";
import { isAdminRole } from "@/lib/auth/policy";

export const metadata = { title: "Team settings" };
export const dynamic = "force-dynamic";

export default async function TeamSettingsPage() {
  const { user } = await requireRole("manager");
  const isAdmin = isAdminRole(user);
  const [members, invitations, assistantBudgets, roleRows, capacities, planning] =
    await Promise.all([
      listTeamMembers(),
      listPendingInvitations(),
      isAdmin ? getAssistantBudgetMap() : Promise.resolve({}),
      listAllProjectRoles(),
      listUserRoleCapacity(),
      getPlanningDefaults(),
    ]);

  return (
    <div className="space-y-6">
      <TeamManager
        members={members}
        invitations={invitations}
        currentUserId={user.id}
        currentUserRole={user.role}
        assistantBudgets={assistantBudgets}
      />
      <RoleCapacityMatrix
        people={members
          .filter((m) => m.isActive)
          .map((m) => ({ id: m.id, name: m.name }))}
        roles={roleRows
          .filter((r) => r.isActive)
          .map((r) => ({ id: r.id, label: r.label, color: r.color }))}
        groups={planning.groups.map((g) => ({ key: g.key, name: g.name }))}
        capacities={capacities.map((c) => ({
          userId: c.userId,
          projectRoleId: c.projectRoleId,
          capacityGroupKey: c.capacityGroupKey,
          projectsAtOnce: c.projectsAtOnce,
        }))}
      />
    </div>
  );
}
