import { describe, expect, it } from "vitest";

import { daysUntil, dueLabel, formatBytes, formatDate } from "@/lib/format";

/** Local YYYY-MM-DD offset by `days` from today (matches parseYmd's local parsing). */
function ymd(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

describe("daysUntil", () => {
  it("is 0 today, positive future, negative past", () => {
    expect(daysUntil(ymd(0))).toBe(0);
    expect(daysUntil(ymd(5))).toBe(5);
    expect(daysUntil(ymd(-3))).toBe(-3);
  });
  it("returns null for missing/invalid", () => {
    expect(daysUntil(null)).toBeNull();
    expect(daysUntil("not-a-date")).toBeNull();
  });
});

describe("dueLabel tone", () => {
  it("classifies by proximity", () => {
    expect(dueLabel(ymd(-2)).tone).toBe("overdue");
    expect(dueLabel(ymd(0)).tone).toBe("soon");
    expect(dueLabel(ymd(2)).tone).toBe("soon");
    expect(dueLabel(ymd(10)).tone).toBe("normal");
    expect(dueLabel(null).tone).toBe("none");
  });
  it("has a readable overdue label", () => {
    expect(dueLabel(ymd(-3)).text).toBe("Overdue 3d");
  });
});

describe("formatDate / formatBytes", () => {
  it("formats a date and null-safes", () => {
    expect(formatDate("2026-06-23")).toBe("Jun 23, 2026");
    expect(formatDate(null)).toBe("—");
  });
  it("humanizes bytes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2_400_000)).toBe("2.3 MB");
  });
});
