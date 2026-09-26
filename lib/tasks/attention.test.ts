import { describe, expect, it } from "vitest";

import { selectPersonalWork, splitTasksByAttention } from "./attention";

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
