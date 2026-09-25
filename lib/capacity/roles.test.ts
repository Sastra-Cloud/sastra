import { describe, expect, it } from "vitest";

import { computeCapacity, computeCapacityByPath, type CapacityInput } from "./roles";

const roles = [
  { id: "trans", key: "translation", label: "Translation", color: null, sortOrder: 1 },
  { id: "proof", key: "proofread", label: "Proofreading", color: null, sortOrder: 2 },
  { id: "mkt", key: "marketing", label: "Marketing", color: null, sortOrder: 3 },
];

const base: CapacityInput = {
  roles,
  capacities: [
    { userId: "sok", userName: "Sok", projectRoleId: "trans", projectsAtOnce: 2 },
    { userId: "dara", userName: "Dara", projectRoleId: "trans", projectsAtOnce: 2 },
    { userId: "vibol", userName: "Vibol", projectRoleId: "proof", projectsAtOnce: 2 },
    { userId: "nita", userName: "Nita", projectRoleId: "mkt", projectsAtOnce: 3 },
  ],
  load: [
    { projectRoleId: "trans", userId: "sok" },
    { projectRoleId: "trans", userId: "dara" },
    { projectRoleId: "trans", userId: "sok" },
    { projectRoleId: "proof", userId: "vibol" },
    { projectRoleId: "proof", userId: "vibol" },
    { projectRoleId: "mkt", userId: "nita" },
  ],
};

describe("computeCapacity", () => {
  it("sums per-role capacity and load", () => {
    const v = computeCapacity(base);
    const trans = v.roles.find((r) => r.roleId === "trans")!;
    expect(trans.capacity).toBe(4); // Sok 2 + Dara 2
    expect(trans.load).toBe(3);
    expect(trans.peopleCount).toBe(2);
    const proof = v.roles.find((r) => r.roleId === "proof")!;
    expect(proof.capacity).toBe(2);
    expect(proof.load).toBe(2);
    expect(proof.utilization).toBe(1);
  });

  it("flags the most-stressed role as the bottleneck", () => {
    const v = computeCapacity(base);
    expect(v.bottleneck?.roleId).toBe("proof"); // 2/2 = 100% util
    expect(v.roles.find((r) => r.roleId === "proof")!.isBottleneck).toBe(true);
    expect(v.roles.find((r) => r.roleId === "trans")!.isBottleneck).toBe(false);
  });

  it("suggests concurrency = the tightest staffed role's capacity", () => {
    const v = computeCapacity(base);
    expect(v.suggestedConcurrency).toBe(2); // proofreading caps it
  });

  it("computes per-person load and status", () => {
    const v = computeCapacity(base);
    const vibol = v.people.find((p) => p.userId === "vibol")!;
    expect(vibol.totalCapacity).toBe(2);
    expect(vibol.totalUsed).toBe(2);
    expect(vibol.status).toBe("full");
    const nita = v.people.find((p) => p.userId === "nita")!;
    expect(nita.totalCapacity).toBe(3);
    expect(nita.totalUsed).toBe(1);
    expect(nita.status).toBe("room");
  });

  it("flags a role that is needed but unstaffed", () => {
    const v = computeCapacity({
      ...base,
      capacities: base.capacities.filter((c) => c.projectRoleId !== "proof"),
    });
    const proof = v.roles.find((r) => r.roleId === "proof")!;
    expect(proof.capacity).toBe(0);
    expect(proof.unstaffed).toBe(true);
    // an unstaffed, in-demand role is the worst bottleneck
    expect(v.bottleneck?.roleId).toBe("proof");
  });

  it("drops roles with neither capacity nor load", () => {
    const v = computeCapacity({ ...base, load: [] });
    // marketing has capacity → kept; a role with no cap and no load would be dropped
    expect(v.roles.every((r) => r.capacity > 0 || r.load > 0)).toBe(true);
  });
});

describe("computeCapacityByPath", () => {
  const groups = [
    { key: "books", name: "Books" },
    { key: "media", name: "Articles & podcasts" },
  ];

  it("scopes capacity and load to each path independently", () => {
    const { paths, overall } = computeCapacityByPath({
      roles,
      capacities: [
        // Sok translates on both paths, at different capacities
        { userId: "sok", userName: "Sok", projectRoleId: "trans", projectsAtOnce: 2, capacityGroupKey: "books" },
        { userId: "sok", userName: "Sok", projectRoleId: "trans", projectsAtOnce: 1, capacityGroupKey: "media" },
        // Dara only proofreads books
        { userId: "dara", userName: "Dara", projectRoleId: "proof", projectsAtOnce: 3, capacityGroupKey: "books" },
      ],
      load: [
        // two book translations in flight → maxes Sok's book translation capacity (2)
        { projectRoleId: "trans", userId: "sok", capacityGroupKey: "books" },
        { projectRoleId: "trans", userId: "sok", capacityGroupKey: "books" },
        // one media translation
        { projectRoleId: "trans", userId: "sok", capacityGroupKey: "media" },
      ],
      groups,
    });

    const books = paths.find((p) => p.group.key === "books")!.view;
    const media = paths.find((p) => p.group.key === "media")!.view;

    // Books translation: capacity 2, load 2 → bottleneck, suggests 2
    const booksTrans = books.roles.find((r) => r.roleId === "trans")!;
    expect(booksTrans.capacity).toBe(2);
    expect(booksTrans.load).toBe(2);
    // Media translation: only Sok's 1-at-once counts here, load 1
    const mediaTrans = media.roles.find((r) => r.roleId === "trans")!;
    expect(mediaTrans.capacity).toBe(1);
    expect(mediaTrans.load).toBe(1);
    // Proofreading exists only on the books path
    expect(media.roles.find((r) => r.roleId === "proof")).toBeUndefined();
    expect(books.roles.find((r) => r.roleId === "proof")!.capacity).toBe(3);

    // Overall rolls a person up across paths: Sok translates 2 + 1 = 3 at once
    const sokOverall = overall.people.find((p) => p.userId === "sok")!;
    expect(sokOverall.totalCapacity).toBe(3);
  });

  it("returns a view for every group even when a path has no staffing", () => {
    const { paths } = computeCapacityByPath({
      roles,
      capacities: [
        { userId: "sok", userName: "Sok", projectRoleId: "trans", projectsAtOnce: 2, capacityGroupKey: "books" },
      ],
      load: [],
      groups,
    });
    expect(paths.map((p) => p.group.key)).toEqual(["books", "media"]);
    expect(paths.find((p) => p.group.key === "media")!.view.roles).toHaveLength(0);
  });
});
