import { describe, expect, it } from "vitest";

import { portfolioDeadline } from "./deadline";

describe("portfolioDeadline", () => {
  it("uses the rights complete-by date ahead of the project fallback", () => {
    expect(
      portfolioDeadline({
        dueDate: "2027-03-29",
        completeByDate: "2025-06-30",
      })
    ).toBe("2025-06-30");
  });

  it("falls back to the project due date without a rights deadline", () => {
    expect(
      portfolioDeadline({
        dueDate: "2026-07-30",
        completeByDate: null,
      })
    ).toBe("2026-07-30");
  });

  it("uses the active reprint campaign deadline for reprint work", () => {
    expect(
      portfolioDeadline({
        dueDate: "2025-01-15",
        completeByDate: "2025-01-10",
        activeReprintStatus: "quoting",
        activeReprintDueDate: "2027-09-01",
      })
    ).toBe("2027-09-01");
  });

  it("does not show the publication deadline when an active reprint has no date", () => {
    expect(
      portfolioDeadline({
        dueDate: "2025-01-15",
        completeByDate: "2025-01-10",
        activeReprintStatus: "planning",
        activeReprintDueDate: null,
      })
    ).toBeNull();
  });
});
