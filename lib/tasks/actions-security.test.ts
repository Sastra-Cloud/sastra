import { beforeEach, describe, expect, it, vi } from "vitest";

import { PgDialect } from "drizzle-orm/pg-core";

const state = vi.hoisted(() => ({
  actor: { id: "member", role: "member" },
  task: {
    projectId: "11111111-1111-4111-8111-111111111111" as string | null,
    assignedTo: "other" as string | null, createdBy: "member",
    title: "Private draft", dueDate: null, printPaymentId: null as string | null,
    assignedBy: "teammate", assignmentSource: "direct", status: "todo", isNextUp: false,
  },
  grants: new Set<string>(),
  writeLostRace: false, reassignOnTransaction: false, approval: false,
  taskRows: [] as Record<string, unknown>[],
  select: vi.fn(), update: vi.fn(), insert: vi.fn(), delete: vi.fn(), set: vi.fn(),
  activity: vi.fn(), clear: vi.fn(), reconcile: vi.fn(), notify: vi.fn(),
  handoff: vi.fn(), start: vi.fn(), revalidate: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({
  requireUser: async () => ({ user: state.actor }),
  requireRole: async () => {
    if (state.actor.role === "member") throw new Error("Manager required");
    return { user: state.actor };
  },
}));
vi.mock("@/lib/db", () => ({ db: {
  select: state.select, update: state.update, insert: state.insert, delete: state.delete,
  transaction: async (run: (tx: unknown) => unknown) => {
    if (state.reassignOnTransaction) state.task.assignedTo = "other";
    return run({ select: state.select, update: state.update, insert: state.insert, delete: state.delete });
  },
} }));
vi.mock("./create", () => ({ insertTaskRow: vi.fn(), notifyAssignment: state.notify, revalidateForTask: state.revalidate }));
vi.mock("./time-service", () => ({ isAutoStartEnabled: async () => true, startTimerFor: state.start, stopTimerFor: vi.fn() }));
vi.mock("./queue-service", () => ({ lockTaskQueues: vi.fn(), touchTaskQueue: vi.fn(), nextTaskRank: async () => 1 }));
vi.mock("./due-date-notifications", () => ({ clearTaskDueDateNotifications: state.clear, reconcileTaskDueDateChange: state.reconcile }));
vi.mock("@/lib/projects/pipeline", () => ({ advanceChapterAfterDone: state.handoff }));
vi.mock("@/lib/notifications", () => ({ clearOverdueNotifications: state.clear }));
vi.mock("@/lib/activity/log", () => ({ logActivity: state.activity }));
vi.mock("@/lib/episodes/workflow-service", () => ({ assertPodcastTaskDependenciesComplete: vi.fn(), notifyReadyEpisodeStages: vi.fn() }));

import { budgetApprovalAssignments, projectManagers, tasks, user as users } from "@/lib/db/schema";
import { deleteTask, moveTaskToProject, setTaskAssignmentDeferred, setTaskDependencies, updateTaskFields, updateTaskStatus } from "./actions";

const taskId = "22222222-2222-4222-8222-222222222222";
const edits = [
  ["dependencies", () => setTaskDependencies(taskId, ["33333333-3333-4333-8333-333333333333"])],
  ["status", () => updateTaskStatus(taskId, "done")],
  ["fields", () => updateTaskFields(taskId, { dueDate: "2026-12-01" })],
  ["move", () => moveTaskToProject(taskId, { projectId: null })],
  ["delete", () => deleteTask(taskId)],
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  state.actor = { id: "member", role: "member" };
  state.task = { projectId: "11111111-1111-4111-8111-111111111111", assignedTo: "other", createdBy: "member", title: "Private draft", dueDate: null, printPaymentId: null, assignedBy: "teammate", assignmentSource: "direct", status: "todo", isNextUp: false };
  state.writeLostRace = state.reassignOnTransaction = state.approval = false;
  state.taskRows = [];
  state.grants = new Set();
  state.select.mockImplementation(() => ({ from: (table: unknown) => {
    const rows = table === tasks ? [state.taskRows.shift() ?? { ...state.task }] : table === users ? [{ active: true, bot: false }] : table === budgetApprovalAssignments && state.approval ? [{ id: "approval" }] : [];
    const result = Object.assign(Promise.resolve(rows), { limit: () => result, for: () => result });
    return { where: (condition: Parameters<PgDialect["sqlToQuery"]>[0]) => table === projectManagers
      ? { limit: async () => state.grants.has(new PgDialect().sqlToQuery(condition).params.join(":")) ? [{ id: "grant" }] : [] }
      : result };
  } }));
  const result = () => Object.assign(Promise.resolve([]), {
    returning: async () => state.writeLostRace ? [] : [{ ...state.task }],
  });
  state.set.mockImplementation(() => ({ where: result }));
  state.update.mockImplementation(() => ({ set: state.set }));
  state.delete.mockImplementation(() => ({ where: result }));
  state.insert.mockImplementation(() => ({ values: () => ({ onConflictDoNothing: async () => undefined }) }));
  state.reconcile.mockResolvedValue({ notificationsChanged: false, changed: true });
  state.clear.mockResolvedValue(0);
  state.handoff.mockResolvedValue(null);
});

function expectNoEffects() {
  for (const effect of [state.insert, state.update, state.delete, state.activity, state.clear, state.reconcile, state.notify, state.handoff, state.start, state.revalidate]) {
    expect(effect).not.toHaveBeenCalled();
  }
}

describe("task mutation authorization", () => {
  it("records the assigning actor and clears previous personal planning only when ownership changes", async () => {
    state.actor.role = "manager";
    await updateTaskFields(taskId, { assignedTo: "new-owner" });
    expect(state.set).toHaveBeenCalledWith(expect.objectContaining({
      assignedBy: "member", assignedAt: expect.any(Date), assignmentSource: "direct", assignmentDeferredAt: null,
    }));
    state.set.mockClear();
    await updateTaskFields(taskId, { assignedTo: "other", title: "Revised" });
    expect(state.set.mock.calls[0][0]).not.toHaveProperty("assignedBy");
  });

  it("lets only the assignee defer eligible requests without changing shared work", async () => {
    await expect(setTaskAssignmentDeferred(taskId, true, null)).rejects.toThrow(/Only your/);
    expect(state.update).not.toHaveBeenCalled();
    state.task.assignedTo = state.actor.id;
    await setTaskAssignmentDeferred(taskId, true, null);
    expect(state.set).toHaveBeenCalledWith({ assignmentDeferredAt: expect.any(Date) });
    state.set.mockClear();
    await setTaskAssignmentDeferred(taskId, false, null);
    expect(state.set).toHaveBeenCalledWith({ assignmentDeferredAt: null });
    expect(state.notify).not.toHaveBeenCalled();
    expect(state.activity).not.toHaveBeenCalled();
  });

  it("cannot defer manager-selected work and reports concurrent assignment changes", async () => {
    state.task.assignedTo = state.actor.id;
    state.task.isNextUp = true;
    await expect(setTaskAssignmentDeferred(taskId, true, null)).rejects.toThrow(/Only your/);
    expect(state.update).not.toHaveBeenCalled();
    state.task.isNextUp = false;
    state.writeLostRace = true;
    await expect(setTaskAssignmentDeferred(taskId, true, null)).rejects.toThrow(/task changed/);
  });

  it.each(edits)("denies another member's %s mutation even to the creator", async (_name, run) => {
    await expect(run()).rejects.toThrow(/own tasks/i);
    expectNoEffects();
  });

  it.each(edits)("allows the assignee's %s mutation", async (_name, run) => {
    state.task.assignedTo = state.actor.id;
    await run();
    expect(state.revalidate).toHaveBeenCalled();
    expect(state.update.mock.calls.length + state.delete.mock.calls.length).toBeGreaterThan(0);
  });

  it.each(edits)("allows a manager's %s mutation on another person's task", async (_name, run) => {
    state.actor.role = "manager";
    await run();
    expect(state.revalidate).toHaveBeenCalled();
  });

  it.each([edits[0], edits[1], edits[2], edits[4]])("allows a scoped manager's %s, then denies a revoked grant", async (_name, run) => {
    state.grants.add(`${state.task.projectId}:${state.actor.id}`);
    await run();
    expect(state.revalidate).toHaveBeenCalled();
    vi.clearAllMocks();
    state.grants.clear();
    await expect(run()).rejects.toThrow(/own tasks/);
    expectNoEffects();
  });

  it("requires authority in both projects when moving another person's task", async () => {
    const destination = "44444444-4444-4444-8444-444444444444";
    state.grants.add(`${state.task.projectId}:${state.actor.id}`);
    await expect(moveTaskToProject(taskId, { projectId: destination })).rejects.toThrow(/permission/);
    expectNoEffects();
    state.grants.add(`${destination}:${state.actor.id}`);
    await expect(moveTaskToProject(taskId, { projectId: destination })).resolves.toEqual({});
    expect(state.update).toHaveBeenCalled();
  });

  it("allows the creator to edit an unassigned task", async () => {
    state.task.assignedTo = null;
    await updateTaskFields(taskId, { title: "Revised title" });
    expect(state.set).toHaveBeenCalledWith(expect.objectContaining({ title: "Revised title" }));
  });

  it("cannot expose a private task by adding it as a dependency of owned work", async () => {
    state.task.assignedTo = state.actor.id;
    state.taskRows = [
      { ...state.task },
      { ...state.task },
      { ...state.task },
      { projectId: null, assignedTo: "other", createdBy: "other" },
    ];
    await expect(setTaskDependencies(taskId, ["33333333-3333-4333-8333-333333333333"]))
      .rejects.toThrow(/access denied/i);
    expectNoEffects();
  });

  it.each([edits[0], edits[3]])("checks authority again under the transaction lock for %s", async (_name, run) => {
    state.task.assignedTo = state.actor.id;
    state.reassignOnTransaction = true;
    await expect(run()).rejects.toThrow(/task changed/i);
    expectNoEffects();
  });

  it.each([edits[1], edits[2], edits[4]])("has no downstream effects when a guarded %s write loses its race", async (_name, run) => {
    state.task.assignedTo = state.actor.id;
    state.writeLostRace = true;
    await expect(run()).rejects.toThrow(/access.*denied/i);
    for (const effect of [state.activity, state.clear, state.reconcile, state.notify, state.handoff, state.start, state.revalidate]) expect(effect).not.toHaveBeenCalled();
  });

  it("keeps protected approval and payment workflows authoritative for owners", async () => {
    state.task.assignedTo = state.actor.id;
    state.approval = true;
    await expect(updateTaskStatus(taskId, "done")).rejects.toThrow(/Budget approval/);
    state.approval = false;
    state.task.printPaymentId = "payment";
    await expect(deleteTask(taskId)).rejects.toThrow(/Printer payment/);
    expectNoEffects();
  });
});
