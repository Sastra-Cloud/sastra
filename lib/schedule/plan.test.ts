import { describe, expect, it } from "vitest";

import {
  autoSchedule,
  monthlyLoad,
  nextSlotCompletion,
  type ScheduleInput,
} from "./plan";
import { addMonths, type DurationByKind } from "@/lib/planning/capacity";

const DURATIONS: DurationByKind = {
  book: 18,
  article: 8,
  podcast: 10,
  video_series: 10,
  other: 12,
};
const TODAY = "2026-07-01";

function books(n: number, deadline: string): ScheduleInput[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `b${i}`,
    deadline,
    kind: "book",
    estimatedDurationMonths: 12, // 12mo for tidy math
  }));
}

describe("autoSchedule", () => {
  it("packs projects into `concurrency` slots, staggering waves", () => {
    const r = autoSchedule(books(4, "2029-01-01"), 2, TODAY, DURATIONS);
    // 2 slots, 12mo each → wave 1 (2 projects) now, wave 2 after 12mo
    const starts = r.map((p) => p.start).sort();
    expect(starts).toEqual(["2026-07-01", "2026-07-01", "2027-07-01", "2027-07-01"]);
    expect(r.every((p) => p.durationMonths === 12)).toBe(true);
  });

  it("flags projects that finish after their deadline", () => {
    // 4 books due Jan 2028, 2 slots, 12mo. Wave 2 ends Jul 2028 → late.
    const r = autoSchedule(books(4, "2028-01-31"), 2, TODAY, DURATIONS);
    expect(r.filter((p) => p.late)).toHaveLength(2);
    // adding a slot removes the conflict
    const r2 = autoSchedule(books(4, "2028-01-31"), 4, TODAY, DURATIONS);
    expect(r2.filter((p) => p.late)).toHaveLength(0);
  });

  it("schedules earliest-deadline first", () => {
    const r = autoSchedule(
      [
        { id: "late", deadline: "2029-01-01", kind: "book", estimatedDurationMonths: 12 },
        { id: "soon", deadline: "2027-01-01", kind: "book", estimatedDurationMonths: 12 },
      ],
      1, // single slot forces ordering
      TODAY,
      DURATIONS
    );
    const soon = r.find((p) => p.id === "soon")!;
    const late = r.find((p) => p.id === "late")!;
    expect(soon.start).toBe(TODAY); // earliest deadline goes first
    expect(late.start).toBe(soon.end);
  });

  it("respects slots occupied by active projects", () => {
    // 1 slot, occupied until 2027-01-01 → the next project can't start before then
    const r = autoSchedule(books(1, "2030-01-01"), 1, TODAY, DURATIONS, ["2027-01-01"]);
    expect(r[0].start).toBe("2027-01-01");
  });

  it("uses the per-kind default when no duration override is given", () => {
    const r = autoSchedule(
      [{ id: "x", deadline: null, kind: "podcast", estimatedDurationMonths: null }],
      3,
      TODAY,
      DURATIONS
    );
    expect(r[0].durationMonths).toBe(10); // podcast default
    expect(r[0].end).toBe("2027-05-01"); // today + 10mo
  });
});

describe("nextSlotCompletion", () => {
  it("starts now when a slot is free", () => {
    const r = nextSlotCompletion([], 3, 18, TODAY);
    expect(r.openNow).toBe(true);
    expect(r.slotOpen).toBe(TODAY);
    expect(r.completion).toBe(addMonths(TODAY, 18));
  });

  it("waits for the earliest running book to finish when all slots are full", () => {
    const r = nextSlotCompletion(["2027-01-01", "2027-06-01", "2027-12-01"], 3, 12, TODAY);
    expect(r.openNow).toBe(false);
    expect(r.slotOpen).toBe("2027-01-01"); // one of three finishes → a slot frees
    expect(r.completion).toBe("2028-01-01");
    expect(r.runningCount).toBe(3);
  });

  it("needs three of five to finish before a slot frees", () => {
    const r = nextSlotCompletion(
      ["2027-01-01", "2027-03-01", "2027-06-01", "2027-09-01", "2027-12-01"],
      3,
      12,
      TODAY
    );
    expect(r.slotOpen).toBe("2027-06-01"); // 3rd earliest finish drops the count below 3
  });

  it("ignores running work that has already finished", () => {
    const r = nextSlotCompletion(["2025-01-01", "2025-02-01"], 1, 12, TODAY);
    expect(r.openNow).toBe(true);
  });
});

describe("monthlyLoad", () => {
  it("counts concurrent projects per month", () => {
    const load = monthlyLoad(
      [
        { start: "2026-07-01", end: "2026-10-01" },
        { start: "2026-08-01", end: "2026-12-01" },
      ],
      "2026-07-01",
      "2026-12-01"
    );
    const at = (ymd: string) => load.find((l) => l.ymd === ymd)?.count;
    expect(at("2026-07-01")).toBe(1); // only the first
    expect(at("2026-09-01")).toBe(2); // both overlap
    expect(at("2026-11-01")).toBe(1); // first ended
    expect(at("2026-12-01")).toBe(0); // both ended (end is exclusive)
  });
});
