import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  snapshot: { projectId: "assigned", assignedTo: "other", createdBy: "manager" },
  locked: {} as { projectId: string; assignedTo: string; createdBy: string },
  update: vi.fn(), remove: vi.fn(), transaction: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/project-access", () => ({ requireTaskEdit: async () => ({ user: { id: "member", role: "member" }, task: state.snapshot }) }));
vi.mock("@/lib/db", () => ({ db: {
  select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
  transaction: state.transaction,
} }));
vi.mock("./create", () => ({ revalidateForTask: vi.fn() }));
vi.mock("./due-date-notifications", () => ({ clearTaskDueDateNotifications: vi.fn() }));
vi.mock("@/lib/activity/log", () => ({ logActivity: vi.fn() }));
import { deleteTask, setTaskDependencies, updateTaskStatus } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  state.locked = { ...state.snapshot };
  state.transaction.mockImplementation(async (run) => run({
    select: () => ({ from: () => ({ where: () => ({ for: async () => [state.locked] }) }) }),
    update: state.update,
    delete: state.remove,
  }));
  state.update.mockReturnValue({ set: () => ({ where: () => ({ returning: async () => [{ projectId: "assigned", title: "Task", assignedTo: "other" }] }) }) });
  state.remove.mockReturnValue({ where: () => ({ returning: async () => [{ projectId: "assigned" }] }) });
});

describe("task authorization survives concurrent moves and assignments", () => {
  it.each([
    ["status", () => updateTaskStatus("task", "todo")],
    ["delete", () => deleteTask("task")],
    ["dependencies", () => setTaskDependencies("task", [])],
  ] as const)("rejects %s when a task has moved outside the authorized project", async (_name, action) => {
    state.locked.projectId = "other-project";
    await expect(action()).rejects.toThrow("task changed");
    expect(state.update).not.toHaveBeenCalled();
    expect(state.remove).not.toHaveBeenCalled();
  });

  it("still saves authorized status changes and rejects lost ownership", async () => {
    await expect(updateTaskStatus("task", "todo")).resolves.toMatchObject({ notificationsChanged: false });
    expect(state.update).toHaveBeenCalledOnce();
    state.update.mockClear();
    state.locked.assignedTo = "new-owner";
    await expect(updateTaskStatus("task", "todo")).rejects.toThrow("task changed");
    expect(state.update).not.toHaveBeenCalled();
  });
});
