import { describe, expect, it } from "vitest";

import {
  addDaysYmd,
  buildScale,
  ganttRange,
  pxToDayDelta,
} from "./scale";

describe("buildScale", () => {
  const scale = buildScale({
    minYmd: "2026-07-01",
    maxYmd: "2026-08-31",
    pxPerDay: 10,
  });

  it("computes width from span × density", () => {
    expect(scale.spanDays).toBe(61);
    expect(scale.width).toBe(610);
  });

  it("maps dates to x offsets", () => {
    expect(scale.x("2026-07-01")).toBe(0);
    expect(scale.x("2026-07-02")).toBe(10);
    expect(scale.x("2026-08-01")).toBe(310);
  });

  it("clamps out-of-range dates", () => {
    expect(scale.x("2020-01-01")).toBe(0);
    expect(scale.x("2030-01-01")).toBe(scale.width);
  });

  it("produces month ticks at range start and 1st-of-months", () => {
    expect(scale.months[0]).toEqual({ x: 0, label: "Jul 2026" });
    expect(scale.months[1]!.label).toBe("Aug");
    expect(scale.months[1]!.x).toBe(310);
  });

  it("labels January ticks with the year", () => {
    const s = buildScale({ minYmd: "2026-12-15", maxYmd: "2027-02-15", pxPerDay: 5 });
    expect(s.months.map((m) => m.label)).toEqual(["Dec 2026", "Jan 2027", "Feb"]);
  });

  it("never collapses to zero span", () => {
    const s = buildScale({ minYmd: "2026-07-01", maxYmd: "2026-07-01", pxPerDay: 10 });
    expect(s.spanDays).toBeGreaterThan(0);
  });
});

describe("pxToDayDelta", () => {
  it("rounds to whole days", () => {
    expect(pxToDayDelta(25, 10)).toBe(3);
    expect(pxToDayDelta(-14, 10)).toBe(-1);
    expect(pxToDayDelta(4, 10)).toBe(0);
    expect(pxToDayDelta(100, 0)).toBe(0);
  });
});

describe("addDaysYmd", () => {
  it("adds and subtracts across month boundaries", () => {
    expect(addDaysYmd("2026-07-30", 5)).toBe("2026-08-04");
    expect(addDaysYmd("2026-07-01", -1)).toBe("2026-06-30");
  });
});

describe("ganttRange", () => {
  it("spans all dates plus today, padded", () => {
    const r = ganttRange(["2026-07-10", null, "2026-09-01"], "2026-07-03");
    expect(r.minYmd).toBe("2026-06-26"); // today − 7
    expect(r.maxYmd).toBe("2026-09-15"); // max + 14
  });

  it("works with no dated items (today only)", () => {
    const r = ganttRange([], "2026-07-03");
    expect(r.minYmd).toBe("2026-06-26");
    expect(r.maxYmd).toBe("2026-07-17");
  });
});
