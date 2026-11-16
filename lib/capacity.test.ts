import { describe, expect, it } from "vitest";

import { utilizationPct, utilizationTone } from "./capacity";

describe("utilizationPct", () => {
  it("returns null when hours or capacity are missing/zero", () => {
    expect(utilizationPct({ weeklyHours: 40, estHours: 0 })).toBeNull();
    expect(utilizationPct({ weeklyHours: 0, estHours: 10 })).toBeNull();
    expect(utilizationPct({})).toBeNull();
  });
  it("rounds hours/capacity to a percentage", () => {
    expect(utilizationPct({ weeklyHours: 40, estHours: 32 })).toBe(80);
    expect(utilizationPct({ weeklyHours: 40, estHours: 50 })).toBe(125);
    expect(utilizationPct({ weeklyHours: 30, estHours: 10 })).toBe(33);
  });
});

describe("utilizationTone", () => {
  it("classifies over/high/ok", () => {
    expect(utilizationTone(120)).toBe("over");
    expect(utilizationTone(101)).toBe("over");
    expect(utilizationTone(100)).toBe("high");
    expect(utilizationTone(81)).toBe("high");
    expect(utilizationTone(80)).toBe("ok");
    expect(utilizationTone(10)).toBe("ok");
  });
});
