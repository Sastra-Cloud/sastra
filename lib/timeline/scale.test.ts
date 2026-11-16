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

  it("maps dates to x offsets", () => {
    expect(scale.x("2026-07-01")).toBe(0);
    expect(scale.x("2026-07-02")).toBe(10);
    expect(scale.x("2026-08-01")).toBe(310);
  });

  it("clamps out-of-range dates", () => {
    expect(scale.x("2020-01-01")).toBe(0);
    expect(scale.x("2030-01-01")).toBe(scale.width);
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
});
