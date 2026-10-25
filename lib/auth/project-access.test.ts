import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { projectManagers, tasks } from "@/lib/db/schema";

const state = vi.hoisted(() => ({
  user: { id: "member", role: "member" },
  requireUser: vi.fn(),
  grants: new Set<string>(),
  records: new Map<string, { projectId: string | null; assignedTo?: string | null; createdBy?: string | null }>(),
  select: vi.fn(),
}));
vi.mock("@/lib/auth/guards", () => ({ requireUser: state.requireUser }));
vi.mock("@/lib/db", () => ({ db: { select: state.select } }));

import { hasProjectCapability, requireProjectCapability, requireProjectRecord, requireTaskEdit } from "./project-access";

beforeEach(() => {
  vi.clearAllMocks();
  state.user = { id: "member", role: "member" };
  state.grants = new Set(["assigned:member", "second:member"]);
  state.records = new Map([["own-task", { projectId: "assigned" }], ["foreign-task", { projectId: "other" }], ["general-task", { projectId: null }]]);
  state.requireUser.mockImplementation(async () => ({ user: state.user }));
  state.select.mockImplementation(() => ({ from: (table: unknown) => ({ where: (condition: Parameters<PgDialect["sqlToQuery"]>[0]) => ({
    // Use the real Drizzle predicate parameters so omitting either project or
    // teammate scope breaks this test. Browser checks cover actual persistence.
    limit: async () => {
      const params = new PgDialect().sqlToQuery(condition).params;
      if (table === projectManagers) return state.grants.has(params.join(":")) ? [{ id: "grant" }] : [];
      if (table === tasks) return state.records.has(String(params[0])) ? [state.records.get(String(params[0]))] : [];
      return [];
    },
  }) }) }));
});

describe("server project management boundary", () => {
  it("allows multiple assignments and denies other projects, teammates, and revoked grants", async () => {
    await expect(requireProjectCapability("assigned")).resolves.toMatchObject({ user: { id: "member" } });
    await expect(requireProjectCapability("second", "tasks.manage")).resolves.toBeDefined();
    await expect(requireProjectCapability("other")).rejects.toThrow("permission");
    await expect(requireProjectCapability(null)).rejects.toThrow("permission");
    expect(await hasProjectCapability({ id: "other-member", role: "member" }, "assigned")).toBe(false);
    state.grants.clear();
    await expect(requireProjectCapability("assigned")).rejects.toThrow("permission");
  });

  it("resolves a child record's real project before granting task management", async () => {
    await expect(requireProjectRecord("task", "own-task", "tasks.manage")).resolves.toBeDefined();
    await expect(requireProjectRecord("task", "foreign-task", "tasks.manage")).rejects.toThrow("permission");
    await expect(requireProjectRecord("task", "general-task", "tasks.manage")).rejects.toThrow("permission");
    await expect(requireProjectRecord("task", "missing", "tasks.manage")).rejects.toThrow("no longer exists");
  });

  it("retains global manager access without a grant and rejects invalid sessions", async () => {
    state.user.role = "manager";
    await expect(requireProjectCapability("other")).resolves.toBeDefined();
    expect(state.select).not.toHaveBeenCalled();
    state.user.role = "unknown";
    await expect(requireProjectCapability("assigned")).rejects.toThrow("permission");
    state.requireUser.mockRejectedValue(new Error("Inactive or signed out"));
    await expect(requireProjectCapability("assigned")).rejects.toThrow("Inactive or signed out");
    expect(state.select).not.toHaveBeenCalled();
  });

  it("preserves members' own work without allowing them to edit other people's projects", async () => {
    state.records.set("personal", { projectId: "other", assignedTo: "member", createdBy: "someone" });
    state.records.set("own-unassigned", { projectId: null, assignedTo: null, createdBy: "member" });
    state.records.set("delegated", { projectId: "other", assignedTo: "someone", createdBy: "member" });
    await expect(requireTaskEdit("personal")).resolves.toBeDefined();
    await expect(requireTaskEdit("own-unassigned")).resolves.toBeDefined();
    await expect(requireTaskEdit("own-task")).resolves.toBeDefined();
    await expect(requireTaskEdit("foreign-task")).rejects.toThrow("own tasks");
    await expect(requireTaskEdit("delegated")).rejects.toThrow("own tasks");
    state.grants.clear();
    await expect(requireTaskEdit("own-task")).rejects.toThrow("own tasks");
  });
});
