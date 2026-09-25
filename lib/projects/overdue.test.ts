import { describe, expect, it } from "vitest";

import { computeOverdue, type OverdueInput } from "./overdue";

const base: OverdueInput = {
  dueDate: "2020-01-01", // firmly in the past
  status: "planning",
  totalTasks: 5,
  doneTasks: 2,
  overdueTasks: 0,
  blockerCount: 0,
};

describe("computeOverdue", () => {
  it("returns null when the due date is in the future", () => {
    expect(computeOverdue({ ...base, dueDate: "2099-12-31" })).toBeNull();
  });

  it("returns null when there is no due date", () => {
    expect(computeOverdue({ ...base, dueDate: null })).toBeNull();
  });

  it("returns null for completed or cancelled projects even if past due", () => {
    expect(computeOverdue({ ...base, status: "completed" })).toBeNull();
    expect(computeOverdue({ ...base, status: "cancelled" })).toBeNull();
  });

  it("reports a positive days-overdue for a past due date", () => {
    const r = computeOverdue(base);
    expect(r).not.toBeNull();
    expect(r!.daysOverdue).toBeGreaterThan(0);
  });

  it("flags 100%-done-but-not-marked-complete", () => {
    const r = computeOverdue({ ...base, totalTasks: 1, doneTasks: 1 });
    expect(r!.allDone).toBe(true);
    expect(r!.reasons[0]).toMatch(/All 1 task is done.*isn't marked complete/);
  });

  it("summarises open and overdue tasks", () => {
    const r = computeOverdue({ ...base, totalTasks: 5, doneTasks: 2, overdueTasks: 2 });
    expect(r!.allDone).toBe(false);
    expect(r!.reasons[0]).toBe("3 of 5 tasks still open — 2 past their own due date.");
  });

  it("summarises open tasks with none individually overdue", () => {
    const r = computeOverdue({ ...base, totalTasks: 4, doneTasks: 1, overdueTasks: 0 });
    expect(r!.reasons[0]).toBe("3 of 4 tasks still open.");
  });

  it("notes when no tasks exist yet", () => {
    const r = computeOverdue({ ...base, totalTasks: 0, doneTasks: 0 });
    expect(r!.reasons[0]).toBe("No tasks have been added to the plan yet.");
  });

  it("appends a blocker reason when blockers are open", () => {
    const r = computeOverdue({ ...base, blockerCount: 2 });
    expect(r!.reasons).toContain("2 open blockers still to resolve.");
  });

  it("uses singular blocker wording for one blocker", () => {
    const r = computeOverdue({ ...base, blockerCount: 1 });
    expect(r!.reasons).toContain("1 open blocker still to resolve.");
  });
});
