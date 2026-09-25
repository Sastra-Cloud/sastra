import { describe, expect, it } from "vitest";

import {
  openLoadClass,
  overdueClass,
  utilizationClass,
  utilizationPct,
  utilizationTone,
} from "./capacity";

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

describe("threshold classes", () => {
  it("utilizationClass tracks tone", () => {
    expect(utilizationClass(120)).toMatch(/destructive/);
    expect(utilizationClass(90)).toMatch(/warning/);
    expect(utilizationClass(50)).toMatch(/success/);
  });
  it("openLoadClass escalates with count", () => {
    expect(openLoadClass(0)).toMatch(/muted/);
    expect(openLoadClass(4)).toBe("");
    expect(openLoadClass(6)).toMatch(/warning/);
    expect(openLoadClass(9)).toMatch(/destructive/);
  });
  it("overdueClass escalates with count", () => {
    expect(overdueClass(0)).toMatch(/muted/);
    expect(overdueClass(1)).toMatch(/warning/);
    expect(overdueClass(3)).toMatch(/destructive/);
  });
});
