import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ reads: [] as unknown[], patch: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {
  select: () => {
    const value = mocks.reads.shift();
    const query = { from: () => query, where: () => query, innerJoin: () => query, leftJoin: () => query, limit: async () => { if (value instanceof Error) throw value; return value; }, orderBy: async () => value };
    return query;
  },
  update: () => ({ set: (fields: unknown) => ({ where: async () => { mocks.patch(fields); } }) }),
} }));
vi.mock("@/lib/notifications", () => ({ notify: vi.fn() }));
vi.mock("@/lib/tasks/due-date-notifications", () => ({ clearTaskDueDateNotifications: vi.fn() }));
import { advanceChapterAfterDone } from "./pipeline";

beforeEach(() => { mocks.reads = []; mocks.patch.mockClear(); });
describe("saved chapter handoffs", () => {
  it("returns canonical next-task fields after saving the cascade", async () => {
    mocks.reads = [
      [{ projectId: "project", unitId: "chapter", phaseId: "stage", completedAt: "2026-09-29T00:00:00Z" }],
      [{ orderIndex: 0 }], [{ id: "next-stage", durationDays: 2, projectRoleId: null }],
      [{ id: "next", title: "Draft title", assignedTo: "actor" }],
      [{ taskId: "next", title: "Saved title", dueDate: "2026-10-01", assigneeName: "Saved owner", slug: "example" }],
    ];
    const result = await advanceChapterAfterDone("completed", "actor");
    expect(mocks.patch).toHaveBeenCalledWith(expect.objectContaining({ dueDate: "2026-10-01", assignedTo: "actor" }));
    expect(result).toEqual({ taskId: "next", title: "Saved title", dueDate: "2026-10-01", assigneeName: "Saved owner", href: "/projects/example/tasks?run=all&task=next" });
  });
  it("keeps completion best-effort without promising an unconfirmed next task", async () => {
    mocks.reads = [new Error("Database unavailable")];
    await expect(advanceChapterAfterDone("task", "actor")).resolves.toBeNull();
    expect(mocks.patch).not.toHaveBeenCalled();
  });
  it("does not invent a pipeline for standalone work", async () => {
    mocks.reads = [[{ projectId: null, unitId: null, phaseId: null }]];
    expect(await advanceChapterAfterDone("task", "actor")).toBeNull();
    expect(mocks.patch).not.toHaveBeenCalled();
  });
});
