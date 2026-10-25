import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const state = vi.hoisted(() => ({
  role: "member", grants: new Set<string>(),
  rule: { projectId: null as string | null, assigneeId: "other" as string | null,
    createdBy: "other", sourceObligationId: null as string | null, isActive: true },
  select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), values: vi.fn(), materialize: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({
  requireUser: async () => ({ user: { id: "member", role: state.role } }),
  requireRole: async () => {
    if (state.role === "member") throw new Error("Manager required");
    return { user: { id: "member", role: state.role } };
  },
}));
vi.mock("@/lib/db", () => ({ db: {
  select: state.select, insert: state.insert, update: state.update, delete: state.delete,
  transaction: async (run: (tx: unknown) => unknown) => run({ update: state.update, delete: state.delete }),
} }));
vi.mock("./create", () => ({ notifyAssignment: vi.fn() }));
vi.mock("./recurring", () => ({ materializeRuleById: state.materialize }));
vi.mock("./due-date-notifications", () => ({ reconcileTaskDueDateChange: vi.fn() }));

import { projectManagers, recurringTasks } from "@/lib/db/schema";
import { createRecurringTask, deleteRecurringTask, setRecurringTaskActive, updateRecurringTask } from "./recurring-actions";

const projectId = "11111111-1111-4111-8111-111111111111";
const input = { title: "Weekly review", frequency: "weekly" as const, anchorDate: "2026-10-23", priority: "medium" as const };
const controls = [
  ["edit", () => updateRecurringTask("rule", input)],
  ["resume", () => setRecurringTaskActive("rule", true)],
  ["delete", () => deleteRecurringTask("rule")],
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  state.role = "member";
  state.grants = new Set();
  state.rule = { projectId: null, assigneeId: "other", createdBy: "other", sourceObligationId: null, isActive: true };
  state.select.mockImplementation(() => ({ from: (table: unknown) => {
    const query = {
      leftJoin: () => query,
      where: (condition: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        const rows = table === recurringTasks ? [{ ...state.rule }]
          : table === projectManagers && state.grants.has(new PgDialect().sqlToQuery(condition).params.join(":")) ? [{ id: "grant" }] : [];
        return Object.assign(Promise.resolve(rows), { limit: async () => rows });
      },
    };
    return query;
  } }));
  state.values.mockReturnValue({ returning: async () => [{ id: "rule" }] });
  state.insert.mockReturnValue({ values: state.values });
  const result = () => Object.assign(Promise.resolve([]), { returning: async () => [{ projectId: state.rule.projectId }] });
  state.update.mockReturnValue({ set: () => ({ where: result }) });
  state.delete.mockReturnValue({ where: result });
});

function expectNoEffects() {
  for (const effect of [state.insert, state.update, state.delete, state.materialize]) expect(effect).not.toHaveBeenCalled();
}

describe("recurring task authority", () => {
  it("checks the destination grant before creating recurring work for another person", async () => {
    const delegated = { ...input, projectId, assigneeId: "other" };
    await expect(createRecurringTask(delegated)).rejects.toThrow(/permission/);
    expectNoEffects();
    state.grants.add(`${projectId}:member`);
    await expect(createRecurringTask(delegated)).resolves.toEqual({ id: "rule" });
    expect(state.values).toHaveBeenCalledWith(expect.objectContaining({ projectId, assigneeId: "other", createdBy: "member" }));
    expect(state.materialize).toHaveBeenCalledWith("rule");
    vi.clearAllMocks();
    await expect(createRecurringTask({ ...delegated, projectId: null })).rejects.toThrow(/permission/);
    state.grants.clear();
    await expect(createRecurringTask(delegated)).rejects.toThrow(/permission/);
    expectNoEffects();
  });

  it.each(["member", null])("allows members to create self-assigned or unassigned work (%s)", async (assigneeId) => {
    await expect(createRecurringTask({ ...input, assigneeId })).resolves.toEqual({ id: "rule" });
    expect(state.values).toHaveBeenCalledWith(expect.objectContaining({ assigneeId, createdBy: "member" }));
    expect(state.materialize).toHaveBeenCalledWith("rule");
  });

  it("allows workspace managers to create recurring work for another person", async () => {
    state.role = "manager";
    await expect(createRecurringTask({ ...input, assigneeId: "other" })).resolves.toEqual({ id: "rule" });
    expect(state.materialize).toHaveBeenCalledWith("rule");
  });

  it.each(controls)("allows scoped %s only for the actual rule project and current grant", async (_name, run) => {
    state.rule.projectId = projectId;
    await expect(run()).rejects.toThrow(/permission/);
    expectNoEffects();
    state.grants.add(`${projectId}:member`);
    await run();
    expect(state.update.mock.calls.length + state.delete.mock.calls.length).toBeGreaterThan(0);
    vi.clearAllMocks();
    state.rule.projectId = "other-project";
    await expect(run()).rejects.toThrow(/permission/);
    state.rule.projectId = projectId;
    state.grants.clear();
    await expect(run()).rejects.toThrow(/permission/);
    expectNoEffects();
  });

  it.each([controls[1], controls[2]])("preserves owners' ability to %s their ordinary schedules", async (_name, run) => {
    state.rule.assigneeId = "member";
    await run();
    expect(state.update.mock.calls.length + state.delete.mock.calls.length).toBeGreaterThan(0);
  });

  it.each(controls)("keeps license-obligation %s restricted to workspace managers", async (_name, run) => {
    state.rule.projectId = projectId;
    state.rule.sourceObligationId = "license";
    state.grants.add(`${projectId}:member`);
    await expect(run()).rejects.toThrow("Manager required");
    expectNoEffects();
  });

  it("allows workspace managers to resume and delete schedules", async () => {
    state.role = "manager";
    await setRecurringTaskActive("rule", true);
    expect(state.update).toHaveBeenCalled();
    expect(state.materialize).toHaveBeenCalledWith("rule");
    await deleteRecurringTask("rule");
    expect(state.delete).toHaveBeenCalledTimes(2);
  });
});
