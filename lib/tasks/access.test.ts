import { beforeEach, describe, expect, it, vi } from "vitest";

import { PgDialect } from "drizzle-orm/pg-core";

const state = vi.hoisted(() => ({ select: vi.fn(), grants: new Set<string>() }));
vi.mock("@/lib/auth/guards", () => ({ requireUser: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: { select: state.select } }));

import { canEditTask, canReadTask, taskEditPredicate } from "./access";

beforeEach(() => {
  state.grants = new Set();
  state.select.mockImplementation(() => ({ from: () => ({ where: (condition: Parameters<PgDialect["sqlToQuery"]>[0]) => ({
    limit: async () => state.grants.has(new PgDialect().sqlToQuery(condition).params.join(":")) ? [{ id: "grant" }] : [],
  }) }) }));
});

const member = { id: "member", role: "member" };
const privateTask = { projectId: null, assignedTo: "other", createdBy: "other" };

describe("task authority", () => {
  it("keeps project viewing separate from changing another person's work", async () => {
    const task = { ...privateTask, projectId: "project" };
    expect(canReadTask(member, task)).toBe(true);
    expect(await canEditTask(member, task)).toBe(false);
    expect(canReadTask(member, privateTask)).toBe(false);
  });

  it("lets a creator maintain unassigned work but not override a later assignee", async () => {
    const task = { ...privateTask, assignedTo: null, createdBy: member.id };
    expect(await canEditTask(member, task)).toBe(true);
    expect(canReadTask(member, { ...task, assignedTo: "other" })).toBe(true);
    expect(await canEditTask(member, { ...task, assignedTo: "other" })).toBe(false);
    expect(await canEditTask(member, { ...privateTask, assignedTo: member.id })).toBe(true);
    expect(await canEditTask(member, { ...privateTask, assignedTo: null })).toBe(false);
  });

  it.each(["manager", "admin", "super_admin"])("preserves %s task management", async (role) => {
    expect(canReadTask({ ...member, role }, privateTask)).toBe(true);
    expect(await canEditTask({ ...member, role }, privateTask)).toBe(true);
  });

  it("uses current grants for the actual task project, never a client-supplied list", async () => {
    const task = { ...privateTask, projectId: "assigned" };
    state.grants.add("assigned:member");
    expect(await canEditTask(member, task)).toBe(true);
    expect(await canEditTask(member, { ...task, projectId: "other" })).toBe(false);
    expect(await canEditTask({ id: "other-member", role: "member" }, task)).toBe(false);
    expect(await canEditTask(member, privateTask)).toBe(false);
    state.grants.clear();
    const staleActor = { ...member, managedProjectIds: ["assigned"] };
    expect(await canEditTask(staleActor, task)).toBe(false);
  });

  it("correlates write-time grants to the task row and authenticated actor", () => {
    // Structural SQL guard: catches dropped project/user scope; does not execute Postgres.
    const query = new PgDialect().sqlToQuery(taskEditPredicate("task", member)!);
    expect(query.sql).toContain('"project_managers"."project_id" = "tasks"."project_id"');
    expect(query.sql).toContain('"project_managers"."user_id" =');
    expect(query.params).toEqual(["task", "member", "member", "member"]);
    const global = new PgDialect().sqlToQuery(taskEditPredicate("task", { ...member, role: "manager" })!);
    expect(global.params).toEqual(["task"]);
    expect(global.sql).not.toContain("project_managers");
  });
});
