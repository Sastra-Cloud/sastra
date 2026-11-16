import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/guards";
import { hasProjectCapability } from "@/lib/auth/project-access";
import { can, isAdminRole } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { user as usersTable } from "@/lib/db/schema";
import { listProjectManagers } from "@/lib/projects/manager-queries";
import { listProjectPeople } from "@/lib/projects/people";
import { getProjectBySlug, listProjectRoles } from "@/lib/projects/queries";
import { getCapacityByPath } from "@/lib/capacity/queries";
import { getPlanningDefaults } from "@/lib/planning/queries";
import { groupForKind } from "@/lib/planning/groups";
import { ProjectManagers } from "@/components/projects/project-managers";
import { ProjectPeopleManager } from "@/components/projects/project-people-manager";

export const metadata = { title: "Project people" };
export const dynamic = "force-dynamic";

export default async function ProjectMembersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { user } = await requireUser();
  const { slug } = await params;
  const data = await getProjectBySlug(slug);
  if (!data) notFound();
  const [roles, people, managers, users, canEdit, capacityByPath, planning] = await Promise.all([
    listProjectRoles(), listProjectPeople(data.project.id), listProjectManagers(data.project.id),
    db.select({ id: usersTable.id, name: usersTable.name, image: usersTable.image, role: usersTable.role })
      .from(usersTable).where(and(eq(usersTable.isActive, true), eq(usersTable.isBot, false))).orderBy(asc(usersTable.name)),
    hasProjectCapability(user, data.project.id), getCapacityByPath(), getPlanningDefaults(),
  ]);
  const projectGroupKey = groupForKind(planning.groups, data.project.kind)?.key;
  const pathView = capacityByPath.paths.find(path => path.group.key === projectGroupKey)?.view ?? capacityByPath.overall;
  const capacityByUser = Object.fromEntries(pathView.people.map(person => [person.userId, { roles: person.roles.map(role => ({ roleId: role.roleId, used: role.used, capacity: role.capacity })) }]));
  const canAssign = can(user, "workspace.manage");
  return <div className="space-y-6">
    <ProjectPeopleManager projectId={data.project.id} canEdit={canEdit}
      people={people.map(person => ({ ...person,
        manager: managers.some(manager => manager.userId === person.id),
        admin: isAdminRole(users.find(candidate => candidate.id === person.id)),
        roles: data.members.filter(member => member.userId === person.id).map(member => ({ id: member.id, roleId: member.roleId, label: member.roleLabel })),
      }))}
      candidates={canEdit ? users : []} capacityByUser={capacityByUser} roles={roles.map(role => ({ id: role.id, label: role.label }))} />
    <ProjectManagers projectId={data.project.id} canAssign={canAssign} managers={managers}
      members={canAssign ? users.filter(person => person.role === "member").map(person => ({ userId: person.id, name: person.name, image: person.image })) : []} />
  </div>;
}
