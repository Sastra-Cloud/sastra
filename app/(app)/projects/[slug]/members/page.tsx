import { requireUser } from "@/lib/auth/guards";
import { hasProjectCapability } from "@/lib/auth/project-access";
import { listProjectManagers } from "@/lib/projects/manager-queries";
import { ProjectManagers } from "@/components/projects/project-managers";
import { db } from "@/lib/db";
import { user as usersTable } from "@/lib/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { can } from "@/lib/auth/policy";
import { notFound } from "next/navigation";

import {
  getProjectBySlug,
  listAssignableUsers,
  listProjectRoles,
} from "@/lib/projects/queries";
import { getCapacityByPath } from "@/lib/capacity/queries";
import { getPlanningDefaults } from "@/lib/planning/queries";
import { groupForKind } from "@/lib/planning/groups";
import { MembersManager } from "@/components/projects/members-manager";

export const dynamic = "force-dynamic";

export default async function ProjectMembersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { user } = await requireUser();
  const { slug } = await params;
  const data = await getProjectBySlug(slug);
  if (!data) notFound();

  const [users, roles, capacityByPath, planning] = await Promise.all([
    listAssignableUsers(),
    listProjectRoles(),
    getCapacityByPath(),
    getPlanningDefaults(),
  ]);
  // Scope the "does this person have room?" hint to this project's work path.
  const projectGroupKey = groupForKind(planning.groups, data.project.kind)?.key;
  const pathView =
    capacityByPath.paths.find((p) => p.group.key === projectGroupKey)?.view ??
    capacityByPath.overall;
  const capacityByUser = Object.fromEntries(
    pathView.people.map((p) => [
      p.userId,
      {
        status: p.status,
        roles: p.roles.map((r) => ({
          roleId: r.roleId,
          used: r.used,
          capacity: r.capacity,
        })),
      },
    ])
  );

  const canAssign = can(user, "workspace.manage");
  const [canEdit, managers, eligibleMembers] = await Promise.all([
    hasProjectCapability(user, data.project.id),
    listProjectManagers(data.project.id),
    canAssign ? db.select({ userId: usersTable.id, name: usersTable.name, image: usersTable.image })
      .from(usersTable).where(and(eq(usersTable.role, "member"), eq(usersTable.isActive, true), eq(usersTable.isBot, false)))
      .orderBy(asc(usersTable.name)) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-5">
    <ProjectManagers projectId={data.project.id} canAssign={canAssign} managers={managers} members={eligibleMembers} />
    <MembersManager
      canEdit={canEdit}
      projectId={data.project.id}
      members={data.members.map((m) => ({
        id: m.id,
        userId: m.userId,
        userName: m.userName,
        userImage: m.userImage,
        roleLabel: m.roleLabel,
        roleColor: m.roleColor,
      }))}
      users={users.map((u) => ({ id: u.id, name: u.name }))}
      roles={roles.map((r) => ({ id: r.id, label: r.label }))}
      capacityByUser={capacityByUser}
    />
    </div>
  );
}
