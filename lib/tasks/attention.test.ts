import { describe, expect, it } from "vitest";

import { printPaymentFollowUp, selectPersonalWork, splitTasksByAttention } from "./attention";

type Task = { id: string; dueDate: string | null; status: string };

const task = (id: string, dueDate: string | null, status = "todo"): Task => ({
  id,
  dueDate,
  status,
});

describe("splitTasksByAttention", () => {
  it("keeps undated, overdue, and next-30-day tasks in the attention queue", () => {
    const result = splitTasksByAttention(
      [
        task("undated", null),
        task("overdue", "2026-07-01"),
        task("boundary", "2026-08-09"),
        task("future", "2026-08-10"),
      ],
      "2026-07-10"
    );

    expect(result.attention.map((item) => item.id)).toEqual([
      "undated",
      "overdue",
      "boundary",
    ]);
    expect(result.later.map((item) => item.id)).toEqual(["future"]);
  });

  it("keeps started and review work visible even with a far-future due date", () => {
    const result = splitTasksByAttention(
      [
        task("started", "2027-01-31", "in_progress"),
        task("review", "2027-01-31", "review"),
        task("todo", "2027-01-31"),
      ],
      "2026-07-10"
    );

    expect(result.attention.map((item) => item.id)).toEqual(["started", "review"]);
    expect(result.later.map((item) => item.id)).toEqual(["todo"]);
  });
});

it("uses the same started-first queue without disturbing manual order", () => {
  const rows = [task("manual-first", null), task("working", "2027-01-01", "in_progress"), task("overdue", "2025-01-01"), task("later", "2027-01-01"), task("review", null, "review"), task("done", null, "done")];
  const selected = selectPersonalWork(rows, "2026-07-10");
  expect(selected.ordered.map(t => t.id)).toEqual(["working", "review", "manual-first", "overdue"]);
  expect(selected.later.map(t => t.id)).toEqual(["later"]);
});

it("keeps every task due today ahead of a large overdue and started backlog", () => {
  const rows = [
    ...Array.from({ length: 12 }, (_, index) => task(`overdue-${index}`, "2026-07-01")),
    task("other-started", null, "in_progress"),
    task("today-review", "2026-07-10", "review"),
    task("today-todo", "2026-07-10"),
    task("today-started", "2026-07-10", "in_progress"),
    ...Array.from({ length: 5 }, (_, index) => task(`today-${index}`, "2026-07-10")),
    task("today-done", "2026-07-10", "done"),
  ];
  const selected = selectPersonalWork(rows, "2026-07-10");
  const todayIds = ["today-review", "today-todo", "today-started", ...Array.from({ length: 5 }, (_, index) => `today-${index}`)];
  expect(selected.dueToday.map(t => t.id)).toEqual(todayIds);
  expect(selected.ordered.slice(0, todayIds.length).map(t => t.id)).toEqual(todayIds);
  expect(selected.working.map(t => t.id)).toEqual(["other-started"]);
  expect(selected.attention.map(t => t.id)).toEqual(rows.slice(0, 12).map(t => t.id));
  expect(new Set(selected.ordered).size).toBe(selected.ordered.length);
});

it("regroups completion and due-date edits and restores the original groups on rollback", () => {
  const rows = [task("old", "2026-07-01"), task("today", "2026-07-10")];
  expect(selectPersonalWork(rows, "2026-07-10").dueToday.map(t => t.id)).toEqual(["today"]);
  const completed = rows.map(t => t.id === "today" ? { ...t, status: "done" } : t);
  expect(selectPersonalWork(completed, "2026-07-10").dueToday).toEqual([]);
  const rescheduled = rows.map(t => t.id === "old" ? { ...t, dueDate: "2026-07-10" } : t);
  expect(selectPersonalWork(rescheduled, "2026-07-10").dueToday.map(t => t.id)).toEqual(["old", "today"]);
  expect(selectPersonalWork(rescheduled, "2026-07-10").attention).toEqual([]);
  expect(selectPersonalWork(rows, "2026-07-10").attention.map(t => t.id)).toEqual(["old"]);
});

it("groups payment follow-ups by their effective date in the workspace timezone", () => {
  const payment = { ...task("payment", "2026-10-10", "review"), printPaymentStatus: "requested", printWireRequestedAt: "2026-10-02T00:30:00Z" };
  // The request was Thursday in Los Angeles but Friday in UTC.
  expect(selectPersonalWork([payment], "2026-10-06", "America/Los_Angeles").dueToday).toEqual([payment]);
  expect(selectPersonalWork([payment], "2026-10-06", "UTC").waiting).toEqual([payment]);
  const todayDeadline = { ...payment, dueDate: "2026-10-06" };
  expect(selectPersonalWork([todayDeadline], "2026-10-06", "UTC").dueToday).toEqual([todayDeadline]);
  expect(selectPersonalWork([payment], "2026-10-07", "America/Los_Angeles").attention).toEqual([payment]);
});

it("waits three business days after a wire request and then returns the task to attention", () => {
  const payment = { ...task("payment", null, "review"), printPaymentStatus: "requested", printWireRequestedAt: new Date("2026-09-25T20:00:00Z") };
  expect(printPaymentFollowUp(payment, "2026-09-29", "America/Los_Angeles")).toEqual({ state: "waiting", date: "2026-09-30" });
  expect(selectPersonalWork([payment], "2026-09-29", "America/Los_Angeles").waiting.map(t => t.id)).toEqual(["payment"]);
  expect(selectPersonalWork([payment], "2026-09-30", "America/Los_Angeles").ordered.map(t => t.id)).toEqual(["payment"]);
});

it("uses an earlier payment due date and treats an unknown send time as due", () => {
  const payment = { ...task("payment", null, "review"), printPaymentStatus: "requested", printWireRequestedAt: new Date("2026-09-25T20:00:00Z"), printPaymentDueDate: "2026-09-28" };
  expect(printPaymentFollowUp(payment, "2026-09-27", "America/Los_Angeles")).toEqual({ state: "waiting", date: "2026-09-28" });
  expect(printPaymentFollowUp({ ...payment, printWireRequestedAt: null }, "2026-09-27")).toEqual({ state: "due", date: "2026-09-27" });
});
