import { describe, expect, it } from "vitest";

import { computeBudgetStatus, monthStartUtc } from "./budget-math";

describe("monthStartUtc", () => {
  it("returns the first instant of the month in UTC", () => {
    expect(monthStartUtc(new Date("2026-06-28T10:30:00Z")).toISOString()).toBe(
      "2026-06-01T00:00:00.000Z"
    );
  });
});

describe("computeBudgetStatus", () => {
  it("allows spend under budget when enabled", () => {
    const s = computeBudgetStatus(1.5, 5, true);
    expect(s.blocked).toBe(false);
    expect(s.remainingUsd).toBeCloseTo(3.5);
  });

  it("blocks at or over the cap", () => {
    expect(computeBudgetStatus(5, 5, true).blocked).toBe(true);
    expect(computeBudgetStatus(6.2, 5, true).blocked).toBe(true);
    expect(computeBudgetStatus(6.2, 5, true).remainingUsd).toBe(0);
  });

  it("blocks when disabled regardless of spend", () => {
    expect(computeBudgetStatus(0, 5, false).blocked).toBe(true);
  });
});
