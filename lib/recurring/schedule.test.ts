import { describe, expect, it } from "vitest";

import {
  nextDueDate,
  occurrenceDate,
  periodKey,
  reportReminderAnchor,
} from "./schedule";

describe("reportReminderAnchor", () => {
  it("puts monthly and quarterly reports one period after signing", () => {
    expect(
      reportReminderAnchor("quarterly", { signedDate: "2026-07-09", today: "2026-07-09" })
    ).toBe("2026-10-09");
    expect(
      reportReminderAnchor("monthly", { signedDate: "2026-07-09", today: "2026-07-09" })
    ).toBe("2026-08-09");
  });

  it("defaults annual agreement reports to January 31 of the following year", () => {
    expect(
      reportReminderAnchor("annual", {
        signedDate: "2026-07-09",
        today: "2026-07-09",
      })
    ).toBe("2027-01-31");
    expect(
      reportReminderAnchor("annual", {
        signedDate: null,
        today: "2026-12-15",
      })
    ).toBe("2027-01-31");
  });

  it("uses today when no signing date is known", () => {
    expect(
      reportReminderAnchor("quarterly", { signedDate: null, today: "2026-01-15" })
    ).toBe("2026-04-15");
  });

  it("honors an explicit first-due date verbatim", () => {
    expect(
      reportReminderAnchor("quarterly", {
        explicit: "2026-12-31",
        signedDate: "2026-07-09",
        today: "2026-07-09",
      })
    ).toBe("2026-12-31");
    expect(
      reportReminderAnchor("annual", {
        explicit: "2027-04-17",
        signedDate: "2026-04-17",
        today: "2026-07-09",
      })
    ).toBe("2027-04-17");
  });
});

describe("occurrenceDate", () => {
  it("steps weekly by 7 days", () => {
    expect(occurrenceDate("2026-06-29", "weekly", 0)).toBe("2026-06-29");
    expect(occurrenceDate("2026-06-29", "weekly", 1)).toBe("2026-07-06");
    expect(occurrenceDate("2026-06-29", "weekly", 5)).toBe("2026-08-03");
  });

  it("steps monthly/quarterly/annual from the anchor without drift", () => {
    // Jan-31 monthly: Feb clamps to 28, but March returns to 31 (computed from anchor).
    expect(occurrenceDate("2026-01-31", "monthly", 1)).toBe("2026-02-28");
    expect(occurrenceDate("2026-01-31", "monthly", 2)).toBe("2026-03-31");
    expect(occurrenceDate("2026-01-15", "quarterly", 1)).toBe("2026-04-15");
    expect(occurrenceDate("2026-07-01", "quarterly", 2)).toBe("2027-01-01");
    expect(occurrenceDate("2026-03-10", "annual", 2)).toBe("2028-03-10");
  });

  it("clamps Feb 29 anchors on non-leap years", () => {
    expect(occurrenceDate("2024-02-29", "annual", 1)).toBe("2025-02-28");
    expect(occurrenceDate("2024-02-29", "annual", 4)).toBe("2028-02-29");
  });
});

describe("nextDueDate", () => {
  it("returns the first occurrence on/after today", () => {
    expect(nextDueDate("2026-01-15", "monthly", "2026-06-29")).toBe("2026-07-15");
    expect(nextDueDate("2026-08-01", "monthly", "2026-06-29")).toBe("2026-08-01"); // future anchor
    expect(nextDueDate("2026-06-29", "weekly", "2026-06-29")).toBe("2026-06-29"); // today itself
  });

  it("respects an end date", () => {
    expect(nextDueDate("2026-01-15", "monthly", "2026-06-29", "2026-12-31")).toBe(
      "2026-07-15"
    );
    expect(nextDueDate("2026-01-15", "monthly", "2027-01-29", "2026-12-31")).toBe(
      null
    );
  });
});

describe("periodKey", () => {
  it("formats the period per cadence", () => {
    expect(periodKey("2026-07-15", "annual")).toBe("2026");
    expect(periodKey("2026-07-15", "quarterly")).toBe("2026-Q3");
    expect(periodKey("2026-01-15", "quarterly")).toBe("2026-Q1");
    expect(periodKey("2026-07-15", "monthly")).toBe("2026-07");
  });
});
