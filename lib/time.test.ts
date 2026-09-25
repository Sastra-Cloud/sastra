import { describe, expect, it } from "vitest";

import {
  elapsedSeconds,
  estimateVsActual,
  formatClock,
  formatDuration,
  roundTo15Min,
  secondsToHours,
} from "./time";

describe("elapsedSeconds", () => {
  it("counts whole seconds and never goes negative", () => {
    const start = new Date("2026-07-02T10:00:00Z");
    expect(elapsedSeconds(start, new Date("2026-07-02T10:00:45Z"))).toBe(45);
    expect(elapsedSeconds("2026-07-02T10:00:00Z", new Date("2026-07-02T11:00:00Z"))).toBe(3600);
    expect(elapsedSeconds(start, new Date("2026-07-02T09:59:00Z"))).toBe(0);
  });
});

describe("formatDuration", () => {
  it("formats compactly", () => {
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(90)).toBe("1m");
    expect(formatDuration(3900)).toBe("1h 05m");
    expect(formatDuration(-5)).toBe("0s");
  });
});

describe("formatClock", () => {
  it("shows mm:ss under an hour and h:mm:ss over", () => {
    expect(formatClock(65)).toBe("01:05");
    expect(formatClock(3723)).toBe("1:02:03");
  });
});

describe("roundTo15Min", () => {
  it("rounds to the nearest quarter hour", () => {
    expect(roundTo15Min(7)).toBe(0);
    expect(roundTo15Min(8)).toBe(15);
    expect(roundTo15Min(23)).toBe(30);
    expect(roundTo15Min(-3)).toBe(0);
  });
});

describe("secondsToHours", () => {
  it("converts", () => {
    expect(secondsToHours(3600)).toBe(1);
    expect(secondsToHours(1800)).toBe(0.5);
  });
});

describe("estimateVsActual", () => {
  it("handles no estimate gracefully", () => {
    const r = estimateVsActual(null, 3600);
    expect(r.estimateHours).toBeNull();
    expect(r.actualHours).toBe(1);
    expect(r.varianceHours).toBeNull();
    expect(r.pctOfEstimate).toBeNull();
    expect(r.over).toBe(false);
  });
  it("computes variance and pct against an estimate", () => {
    const r = estimateVsActual(2, 3 * 3600); // est 2h, actual 3h
    expect(r.varianceHours).toBe(1);
    expect(r.pctOfEstimate).toBe(150);
    expect(r.over).toBe(true);
  });
  it("treats a zero estimate as no estimate", () => {
    expect(estimateVsActual(0, 3600).estimateHours).toBeNull();
  });
});
