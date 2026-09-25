import { describe, expect, it } from "vitest";

import {
  can,
  canAssignTeamRole,
  canManage,
  canManageTeamRole,
  isAdminRole,
  isSuperAdminRole,
  type Capability,
  type TeamRole,
} from "./policy";

const CAPABILITIES: Capability[] = [
  "workspace.manage",
  "wiki.view",
  "wiki.edit",
  "project.edit",
  "tasks.manage",
  "budget.edit",
  "rights.edit",
  "print.manage",
  "correspondence.view",
  "chat.createChannel",
  "chat.manageMembers",
  "standups.manage",
  "comments.moderate",
  "reports.export",
  "donations.manage",
  "costs.view",
  "ai.configure",
  "ai.experimental",
  "security.monitor",
];

describe("can — full role × capability table", () => {
  const expected: Record<TeamRole, (cap: Capability) => boolean> = {
    super_admin: () => true,
    admin: (cap) => cap !== "security.monitor" && cap !== "ai.experimental",
    manager: (cap) =>
      cap !== "ai.configure" &&
      cap !== "ai.experimental" &&
      cap !== "costs.view" &&
      cap !== "donations.manage" &&
      cap !== "security.monitor",
    member: (cap) => cap === "wiki.view",
  };

  for (const role of [
    "super_admin",
    "admin",
    "manager",
    "member",
  ] as TeamRole[]) {
    for (const cap of CAPABILITIES) {
      it(`${role} / ${cap} → ${expected[role](cap)}`, () => {
        expect(can(role, cap)).toBe(expected[role](cap));
        expect(can({ role }, cap)).toBe(expected[role](cap)); // object form
      });
    }
  }
});

describe("can — defensive inputs", () => {
  it("denies unknown/missing roles", () => {
    expect(can("superuser", "project.edit")).toBe(false);
    expect(can("", "project.edit")).toBe(false);
    expect(can(null, "project.edit")).toBe(false);
    expect(can(undefined, "project.edit")).toBe(false);
    expect(can({ role: null }, "project.edit")).toBe(false);
    expect(can({}, "project.edit")).toBe(false);
  });
});

describe("canManage", () => {
  it("matches the admin-or-manager convention", () => {
    expect(canManage("admin")).toBe(true);
    expect(canManage("super_admin")).toBe(true);
    expect(canManage("manager")).toBe(true);
    expect(canManage("member")).toBe(false);
    expect(canManage({ role: "manager" })).toBe(true);
  });
});

describe("admin role helpers", () => {
  it("includes super admins in admin access without conflating the roles", () => {
    expect(isAdminRole("super_admin")).toBe(true);
    expect(isAdminRole("admin")).toBe(true);
    expect(isAdminRole("manager")).toBe(false);
    expect(isSuperAdminRole("super_admin")).toBe(true);
    expect(isSuperAdminRole("admin")).toBe(false);
  });

  it("prevents same-rank and upward team administration", () => {
    expect(canAssignTeamRole("manager", "admin")).toBe(false);
    expect(canAssignTeamRole("admin", "admin")).toBe(true);
    expect(canAssignTeamRole("admin", "super_admin")).toBe(false);
    expect(canAssignTeamRole("super_admin", "super_admin")).toBe(true);

    expect(canManageTeamRole("admin", "manager")).toBe(true);
    expect(canManageTeamRole("admin", "admin")).toBe(false);
    expect(canManageTeamRole("admin", "super_admin")).toBe(false);
    expect(canManageTeamRole("super_admin", "admin")).toBe(true);
    expect(canManageTeamRole("super_admin", "super_admin")).toBe(true);
  });
});
