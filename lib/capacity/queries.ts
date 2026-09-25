import "server-only";

import { eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  projectMembers,
  projectRoles,
  projects,
  user,
  userRoleCapacity,
} from "@/lib/db/schema";
import {
  computeCapacity,
  computeCapacityByPath,
  type CapacityByPath,
  type CapacityView,
} from "@/lib/capacity/roles";
import { getPlanningDefaults } from "@/lib/planning/queries";
import { groupForKind } from "@/lib/planning/groups";

/** All (person, role, path, at-once) capacity rows joined with names, active flag. */
export async function listUserRoleCapacity() {
  return db
    .select({
      userId: userRoleCapacity.userId,
      userName: user.name,
      isActive: user.isActive,
      projectRoleId: userRoleCapacity.projectRoleId,
      capacityGroupKey: userRoleCapacity.capacityGroupKey,
      roleLabel: projectRoles.label,
      roleColor: projectRoles.color,
      projectsAtOnce: userRoleCapacity.projectsAtOnce,
    })
    .from(userRoleCapacity)
    .innerJoin(user, eq(user.id, userRoleCapacity.userId))
    .innerJoin(projectRoles, eq(projectRoles.id, userRoleCapacity.projectRoleId));
}

/**
 * The current role load: one row per (active/planning project, role member) —
 * i.e. which roles are engaged on live projects, by whom, and on which project
 * kind (mapped to a work path by the caller). Role load = the number of active
 * projects staffed for that role; a person's load in a role = how many active
 * projects they hold that role on. Uses project membership, which is populated
 * whenever people are assigned (manually or by the pipeline).
 */
export async function listRoleLoad(): Promise<
  { projectRoleId: string; userId: string | null; kind: string | null }[]
> {
  const rows = await db
    .select({
      projectRoleId: projectMembers.projectRoleId,
      userId: projectMembers.userId,
      kind: projects.kind,
    })
    .from(projectMembers)
    .innerJoin(projects, eq(projects.id, projectMembers.projectId))
    .where(inArray(projects.status, ["planning", "active"]));
  return rows;
}

async function loadCapacityInputs() {
  const [roleRows, caps, load, defaults] = await Promise.all([
    db
      .select({
        id: projectRoles.id,
        key: projectRoles.key,
        label: projectRoles.label,
        color: projectRoles.color,
        sortOrder: projectRoles.sortOrder,
      })
      .from(projectRoles)
      .where(eq(projectRoles.isActive, true)),
    listUserRoleCapacity(),
    listRoleLoad(),
    getPlanningDefaults(),
  ]);
  const groups = defaults.groups;
  return {
    roles: roleRows,
    groups,
    capacities: caps
      .filter((c) => c.isActive)
      .map((c) => ({
        userId: c.userId,
        userName: c.userName,
        projectRoleId: c.projectRoleId,
        projectsAtOnce: c.projectsAtOnce,
        capacityGroupKey: c.capacityGroupKey,
      })),
    load: load.map((l) => ({
      projectRoleId: l.projectRoleId,
      userId: l.userId,
      capacityGroupKey:
        groupForKind(groups, l.kind)?.key ?? groups[0]?.key ?? "",
    })),
  };
}

/**
 * Capacity broken down by work path (plus an overall roll-up). Each path's
 * bottleneck and suggested concurrency count only the staffing and load on that
 * path, so Books and the shared creative-media path are assessed independently.
 */
export async function getCapacityByPath(): Promise<CapacityByPath> {
  const { roles, capacities, load, groups } = await loadCapacityInputs();
  return computeCapacityByPath({
    roles,
    capacities,
    load,
    groups: groups.map((g) => ({ key: g.key, name: g.name, kinds: g.kinds })),
  });
}

/** Overall role-capacity view across all paths (per-person roll-up). */
export async function getCapacityView(): Promise<CapacityView> {
  const { roles, capacities, load } = await loadCapacityInputs();
  return computeCapacity({ roles, capacities, load });
}
