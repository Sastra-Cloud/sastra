import { describe, expect, it } from "vitest";

import {
  addMonths,
  deriveExpectedFinish,
  durationForKind,
  plannedEnd,
  type DurationByKind,
} from "./capacity";

const DURATIONS: DurationByKind = {
  book: 18,
  article: 8,
  podcast: 10,
  video_series: 10,
  other: 12,
};
const TODAY = "2026-07-13";

describe("addMonths", () => {
  it("adds whole months and rolls over the year", () => {
    expect(addMonths("2026-09-30", 18)).toBe("2028-03-30");
    expect(addMonths("2026-07-13", 6)).toBe("2027-01-13");
  });
});

describe("durationForKind", () => {
  it("returns the per-kind duration, treating untyped/unknown as a book", () => {
    expect(durationForKind(DURATIONS, "book")).toBe(18);
    expect(durationForKind(DURATIONS, "podcast")).toBe(10);
    // Untyped projects are treated as books (the primary kind).
    expect(durationForKind(DURATIONS, null)).toBe(18);
    expect(durationForKind(DURATIONS, "unknown")).toBe(18);
  });
});

describe("plannedEnd", () => {
  it("is start + kind default when no override", () => {
    expect(
      plannedEnd({ startDate: "2025-05-01", estimatedDurationMonths: null, kind: "book" }, DURATIONS)
    ).toBe("2026-11-01");
  });
  it("honors an explicit duration override", () => {
    expect(
      plannedEnd({ startDate: "2025-05-01", estimatedDurationMonths: 24, kind: "book" }, DURATIONS)
    ).toBe("2027-05-01");
  });
  it("is null when the project has no start", () => {
    expect(
      plannedEnd({ startDate: null, estimatedDurationMonths: 12, kind: "book" }, DURATIONS)
    ).toBeNull();
  });
});

describe("deriveExpectedFinish", () => {
  const scheduled = {
    startDate: "2025-05-01",
    dueDate: null,
    completeByDate: null,
    kind: "book",
    estimatedDurationMonths: null,
  };

  it("uses the planned window (start + duration) even when a deadline exists", () => {
    expect(
      deriveExpectedFinish(
        { ...scheduled, dueDate: "2028-01-31", completeByDate: "2028-01-31" },
        DURATIONS,
        TODAY
      )
    ).toBe("2026-11-01"); // start 2025-05 + 18mo — NOT the piled placeholder deadline
  });

  it("honors an explicit estimated-duration override", () => {
    expect(
      deriveExpectedFinish({ ...scheduled, estimatedDurationMonths: 24 }, DURATIONS, TODAY)
    ).toBe("2027-05-01");
  });

  it("falls back to the deadline only when the project isn't scheduled", () => {
    const unscheduled = { startDate: null, kind: "book", estimatedDurationMonths: null };
    expect(
      deriveExpectedFinish(
        { ...unscheduled, dueDate: "2027-02-15", completeByDate: "2027-06-30" },
        DURATIONS,
        TODAY
      )
    ).toBe("2027-06-30"); // completeByDate wins over dueDate
    expect(
      deriveExpectedFinish({ ...unscheduled, dueDate: "2027-02-15", completeByDate: null }, DURATIONS, TODAY)
    ).toBe("2027-02-15");
  });

  it("falls back to today + kind duration when nothing is scheduled or dated", () => {
    expect(
      deriveExpectedFinish(
        { startDate: null, dueDate: null, completeByDate: null, kind: "article", estimatedDurationMonths: null },
        DURATIONS,
        TODAY
      )
    ).toBe("2027-03-13"); // today + 8mo
  });
});
