/**
 * Pure role-capacity aggregation. No DB, no `window` — unit-testable and
 * client-safe. Turns per-person role capacities and the current in-flight work
 * into per-role load/bottleneck and per-person utilization.
 */

export type CapacityInput = {
  roles: {
    id: string;
    key: string;
    label: string;
    color: string | null;
    sortOrder: number;
  }[];
  /** One row per (person, role) they can do, with how many they carry at once. */
  capacities: {
    userId: string;
    userName: string;
    projectRoleId: string;
    projectsAtOnce: number;
  }[];
  /** One row per active project currently in a role's stage (who's doing it). */
  load: { projectRoleId: string; userId: string | null }[];
};

export type RoleCapacity = {
  roleId: string;
  key: string;
  label: string;
  color: string | null;
  peopleCount: number;
  capacity: number;
  load: number;
  utilization: number; // load / capacity (0 when no capacity and no load)
  isBottleneck: boolean;
  /** Needed now (load > 0) but nobody can do it. */
  unstaffed: boolean;
};

export type PersonCapacity = {
  userId: string;
  userName: string;
  roles: {
    roleId: string;
    label: string;
    color: string | null;
    capacity: number;
    used: number;
  }[];
  totalCapacity: number;
  totalUsed: number;
  status: "room" | "tight" | "full";
};

export type CapacityView = {
  roles: RoleCapacity[];
  people: PersonCapacity[];
  /** The most-stressed role (highest utilization), if any load/capacity exists. */
  bottleneck: { roleId: string; label: string; capacity: number; load: number } | null;
  /** Structural limit on concurrent projects — the tightest staffed role. */
  suggestedConcurrency: number;
};

/** A work path plus the capacity view for the people/load scoped to it. */
export type PathCapacityView = {
  group: { key: string; name: string; kinds?: string[] };
  view: CapacityView;
};

export type CapacityByPath = {
  /** One view per work path (staffing scoped to that path only). */
  paths: PathCapacityView[];
  /** Every path combined — a person's total across paths. For summaries. */
  overall: CapacityView;
};

export function computeCapacity(input: CapacityInput): CapacityView {
  const capByRole = new Map<string, number>();
  const peopleByRole = new Map<string, number>();
  for (const c of input.capacities) {
    capByRole.set(c.projectRoleId, (capByRole.get(c.projectRoleId) ?? 0) + c.projectsAtOnce);
    peopleByRole.set(c.projectRoleId, (peopleByRole.get(c.projectRoleId) ?? 0) + 1);
  }

  const loadByRole = new Map<string, number>();
  const usedByPersonRole = new Map<string, number>(); // key `${userId}:${roleId}`
  for (const l of input.load) {
    loadByRole.set(l.projectRoleId, (loadByRole.get(l.projectRoleId) ?? 0) + 1);
    if (l.userId) {
      const k = `${l.userId}:${l.projectRoleId}`;
      usedByPersonRole.set(k, (usedByPersonRole.get(k) ?? 0) + 1);
    }
  }

  const roles: RoleCapacity[] = [...input.roles]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((r) => {
      const capacity = capByRole.get(r.id) ?? 0;
      const load = loadByRole.get(r.id) ?? 0;
      return {
        roleId: r.id,
        key: r.key,
        label: r.label,
        color: r.color,
        peopleCount: peopleByRole.get(r.id) ?? 0,
        capacity,
        load,
        utilization: capacity > 0 ? load / capacity : load > 0 ? Infinity : 0,
        isBottleneck: false,
        unstaffed: load > 0 && capacity === 0,
      };
    })
    .filter((r) => r.capacity > 0 || r.load > 0);

  // Bottleneck = highest utilization; ties broken by smaller capacity.
  let bottleneck: CapacityView["bottleneck"] = null;
  let best: RoleCapacity | null = null;
  for (const r of roles) {
    if (
      !best ||
      r.utilization > best.utilization ||
      (r.utilization === best.utilization && r.capacity < best.capacity)
    ) {
      best = r;
    }
  }
  if (best && (best.load > 0 || best.capacity > 0)) {
    best.isBottleneck = true;
    bottleneck = { roleId: best.roleId, label: best.label, capacity: best.capacity, load: best.load };
  }

  const staffedCaps = roles.filter((r) => r.capacity > 0).map((r) => r.capacity);
  const suggestedConcurrency = staffedCaps.length ? Math.min(...staffedCaps) : 0;

  // Per-person view.
  const byUser = new Map<string, PersonCapacity>();
  for (const c of input.capacities) {
    const role = input.roles.find((r) => r.id === c.projectRoleId);
    if (!role) continue;
    let person = byUser.get(c.userId);
    if (!person) {
      person = { userId: c.userId, userName: c.userName, roles: [], totalCapacity: 0, totalUsed: 0, status: "room" };
      byUser.set(c.userId, person);
    }
    const used = usedByPersonRole.get(`${c.userId}:${c.projectRoleId}`) ?? 0;
    person.roles.push({ roleId: role.id, label: role.label, color: role.color, capacity: c.projectsAtOnce, used });
    person.totalCapacity += c.projectsAtOnce;
    person.totalUsed += used;
  }
  const people = [...byUser.values()].map((p) => {
    const u = p.totalCapacity > 0 ? p.totalUsed / p.totalCapacity : p.totalUsed > 0 ? Infinity : 0;
    p.status = u >= 1 ? "full" : u >= 0.75 ? "tight" : "room";
    p.roles.sort((a, b) => a.label.localeCompare(b.label));
    return p;
  });
  people.sort((a, b) => a.userName.localeCompare(b.userName));

  return { roles, people, bottleneck, suggestedConcurrency };
}

/**
 * Compute a capacity view per work path plus an overall roll-up. Capacity and
 * load rows carry the path they belong to (`capacityGroupKey`); each path's view
 * counts only its own rows, so bottlenecks and suggested concurrency are scoped
 * to that path (Books can be jammed while the creative-media path has room).
 */
export function computeCapacityByPath(input: {
  roles: CapacityInput["roles"];
  capacities: (CapacityInput["capacities"][number] & { capacityGroupKey: string })[];
  load: (CapacityInput["load"][number] & { capacityGroupKey: string })[];
  groups: { key: string; name: string; kinds?: string[] }[];
}): CapacityByPath {
  const paths: PathCapacityView[] = input.groups.map((g) => ({
    group: g,
    view: computeCapacity({
      roles: input.roles,
      capacities: input.capacities.filter((c) => c.capacityGroupKey === g.key),
      load: input.load.filter((l) => l.capacityGroupKey === g.key),
    }),
  }));
  const overall = computeCapacity({
    roles: input.roles,
    capacities: input.capacities,
    load: input.load,
  });
  return { paths, overall };
}
