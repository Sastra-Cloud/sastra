import { isHostedInstance, hostedAccountUrl } from "@/lib/hosted/mode";
import { seatUsage } from "@/lib/hosted/entitlements";
import { occupiedSeats } from "@/lib/hosted/seats";
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
  const hosted = isHostedInstance();
  const seats = hosted ? await seatUsage() : null;
  const accountUrl = hostedAccountUrl();
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
      {seats ? <section className="rounded-lg border bg-card p-4 text-sm"><p className="font-medium">{occupiedSeats(seats)}{seats.limit === null ? "" : ` of ${seats.limit}`} seats used</p><p className="text-muted-foreground">{seats.activeHumans} active people and {seats.pendingInvites} pending invitations. Invitations reserve a seat until accepted or expired.</p>{accountUrl ? <a href={accountUrl} className="mt-2 inline-block font-medium text-primary underline">Manage account</a> : <p className="mt-2">Contact Sastra Cloud support to change your plan.</p>}</section> : null}
      <TeamManager
        aiUnit={hosted ? "credits" : "usd"}
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
