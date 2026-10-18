import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  requireRole: vi.fn(), transaction: vi.fn(), update: vi.fn(), set: vi.fn(),
  lock: vi.fn(), touch: vi.fn(), nextRank: vi.fn(), rows: [] as unknown[][],
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireRole: state.requireRole, requireUser: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { transaction: state.transaction } }));
vi.mock("./queue-service", () => ({ lockTaskQueues: state.lock, touchTaskQueue: state.touch, nextTaskRank: state.nextRank }));
vi.mock("./create", () => ({ insertTaskRow: vi.fn(), notifyAssignment: vi.fn(), revalidateForTask: vi.fn() }));
vi.mock("./time-service", () => ({ isAutoStartEnabled: vi.fn(), startTimerFor: vi.fn(), stopTimerFor: vi.fn() }));
vi.mock("./due-date-notifications", () => ({ clearTaskDueDateNotifications: vi.fn(), reconcileTaskDueDateChange: vi.fn() }));
vi.mock("@/lib/projects/pipeline", () => ({ advanceChapterAfterDone: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ clearOverdueNotifications: vi.fn() }));
vi.mock("@/lib/activity/log", () => ({ logActivity: vi.fn() }));
vi.mock("@/lib/episodes/workflow-service", () => ({ assertPodcastTaskDependenciesComplete: vi.fn(), notifyReadyEpisodeStages: vi.fn() }));

import { reorderUserTasks, setTaskNextUp } from "./actions";

const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";
const owner = "assignee";

beforeEach(() => {
  vi.clearAllMocks();
  state.rows = [];
  state.requireRole.mockResolvedValue({ user: { id: "manager" } });
  state.lock.mockResolvedValue(new Map([[owner, { userId: owner, revision: 4 }]]));
  state.touch.mockResolvedValue({ userId: owner, revision: 5 });
  state.nextRank.mockResolvedValue(12);
  state.set.mockImplementation(() => ({ where: vi.fn().mockResolvedValue([]) }));
  state.update.mockImplementation(() => ({ set: state.set }));
  state.transaction.mockImplementation(async (run) => run({
    update: state.update,
    select: () => ({ from: () => ({ where: () => {
      const result = state.rows.shift() ?? [];
      return { for: async () => result, then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve(result).then(resolve) };
    } }) }),
  }));
});

describe("manager queue actions", () => {
  it("enforces manager authority before either action can touch the database", async () => {
    state.requireRole.mockRejectedValue(new Error("Manager required"));
    await expect(setTaskNextUp(firstId, true)).rejects.toThrow("Manager required");
    await expect(reorderUserTasks(owner, [firstId], 4)).rejects.toThrow("Manager required");
    expect(state.transaction).not.toHaveBeenCalled();
  });
  it("rejects stale managers before writing ranks", async () => {
    await expect(reorderUserTasks(owner, [firstId], 3)).rejects.toThrow("queue changed");
    expect(state.update).not.toHaveBeenCalled();
  });
  it("rejects a partial or foreign queue without changing any task", async () => {
    state.rows = [[{ id: firstId }, { id: secondId }]];
    await expect(reorderUserTasks(owner, [firstId], 4)).rejects.toThrow("queue changed");
    expect(state.update).not.toHaveBeenCalled();
  });
  it("saves a complete order without changing activity timestamps or selection", async () => {
    state.rows = [[{ id: firstId }, { id: secondId }]];
    await expect(reorderUserTasks(owner, [secondId, firstId], 4)).resolves.toEqual({ userId: owner, revision: 5 });
    expect(state.set.mock.calls.map(call => call[0])).toEqual([{ rank: 0 }, { rank: 1 }]);
    expect(state.touch).toHaveBeenCalledWith(expect.anything(), owner, "manager");
  });
  it("selects work at the end of the shared selection, without touching dates/status/activity", async () => {
    state.rows = [[{ assignedTo: owner }], [{ id: firstId, assignedTo: owner, status: "todo", isNextUp: false, rank: 2 }]];
    await expect(setTaskNextUp(firstId, true, 4)).resolves.toMatchObject({ isNextUp: true, rank: 12 });
    expect(state.set).toHaveBeenCalledWith({ isNextUp: true, rank: 12 });
  });
  it.each([
    { assignedTo: null, status: "todo" },
    { assignedTo: owner, status: "done" },
    { assignedTo: "other-owner", status: "todo" },
  ])("rejects unassigned, finished, or concurrently reassigned work", async task => {
    state.rows = [[{ assignedTo: owner }], [task]];
    await expect(setTaskNextUp(firstId, true, 4)).rejects.toThrow();
    expect(state.update).not.toHaveBeenCalled();
  });
});
