import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ saved: {} as Record<string, unknown> }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { transaction: async (run: (tx: unknown) => unknown) => run({
  insert: () => ({ values: (values: Record<string, unknown>) => {
    state.saved = values;
    return { returning: async () => [{ id: "task" }] };
  } }),
}) } }));
vi.mock("./queue-service", () => ({ lockTaskQueues: vi.fn(), nextTaskRank: async () => 0, touchTaskQueue: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ notify: vi.fn() }));
vi.mock("@/lib/blockers/engine", () => ({ recomputeProjectBlockers: vi.fn() }));
vi.mock("@/lib/activity/log", () => ({ logActivity: vi.fn() }));

import { insertTaskRow } from "./create";
import { selectPersonalWork } from "./attention";

beforeEach(() => { state.saved = {}; });

it("keeps generated tasks out of teammate requests even when their rule has a human creator", async () => {
  await insertTaskRow({ title: "Generated work", assignedTo: "assignee" }, {
    actorId: "manager", revalidate: false, notifyAssignment: false,
  });
  const generated = { ...state.saved, id: "generated" } as Parameters<typeof selectPersonalWork>[0][number];
  expect(selectPersonalWork([generated], "2026-10-26").fromTeammates).toEqual([]);
  await insertTaskRow({ title: "Approved request", assignedTo: "assignee" }, {
    actorId: "manager", assignmentSource: "direct", revalidate: false, notifyAssignment: false,
  });
  const direct = { ...state.saved, id: "direct" } as Parameters<typeof selectPersonalWork>[0][number];
  expect(selectPersonalWork([direct], "2026-10-26").fromTeammates).toEqual([direct]);
  expect(direct.assignedBy).toBe("manager");
  expect(direct.assignedAt).toBeInstanceOf(Date);
});
