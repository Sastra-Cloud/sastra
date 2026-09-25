import { describe, expect, it } from "vitest";

import {
  dueDateChangeBody,
  overdueTaskBody,
} from "./due-date-copy";

describe("task due-date notification copy", () => {
  it("puts the replacement date in a reschedule notification", () => {
    expect(dueDateChangeBody("Edit chapter 3", "2026-07-30")).toBe(
      "Now due Jul 30, 2026"
    );
  });

  it("states when a due date was removed", () => {
    expect(dueDateChangeBody("Edit chapter 3", null)).toBe(
      "No due date"
    );
  });

  it("includes the actual missed date in overdue reminders", () => {
    expect(overdueTaskBody("Edit chapter 3", "2026-07-15")).toBe(
      "Was due Jul 15, 2026"
    );
  });
});
