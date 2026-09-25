import { describe, expect, it } from "vitest";

import { compareTaskBoardDueDate } from "./board-order";

describe("compareTaskBoardDueDate", () => {
  it("puts the earliest due task first", () => {
    const tasks = [
      { id: "later", dueDate: "2029-07-24" },
      { id: "today", dueDate: "2026-08-06" },
      { id: "middle", dueDate: "2028-03-31" },
    ];

    expect(tasks.sort(compareTaskBoardDueDate).map((task) => task.id)).toEqual([
      "today",
      "middle",
      "later",
    ]);
  });

  it("keeps undated tasks below dated work", () => {
    const tasks = [
      { id: "undated", dueDate: null },
      { id: "dated", dueDate: "2030-02-19" },
    ];

    expect(tasks.sort(compareTaskBoardDueDate).map((task) => task.id)).toEqual([
      "dated",
      "undated",
    ]);
  });

  it("preserves the existing order for equal dates", () => {
    const tasks = [
      { id: "first", dueDate: "2028-03-31" },
      { id: "second", dueDate: "2028-03-31" },
    ];

    expect(tasks.sort(compareTaskBoardDueDate).map((task) => task.id)).toEqual([
      "first",
      "second",
    ]);
  });
});
