import { describe, expect, it } from "vitest";

import { formatTokens, formatUsd, parseRange, resolveRange } from "./usage-math";

const NOW = new Date("2026-07-02T10:30:00Z");

describe("parseRange", () => {
  it("defaults unknown/empty input to month", () => {
    expect(parseRange(undefined)).toBe("month");
    expect(parseRange(null)).toBe("month");
    expect(parseRange("nonsense")).toBe("month");
  });
  it("passes valid ranges through", () => {
    expect(parseRange("90d")).toBe("90d");
    expect(parseRange("all")).toBe("all");
    expect(parseRange("month")).toBe("month");
  });
});

describe("resolveRange", () => {
  it("month starts at the first of the current UTC month, day buckets", () => {
    const r = resolveRange("month", NOW);
    expect(r.start?.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(r.bucket).toBe("day");
    expect(r.label).toBe("This month");
  });
  it("90d starts 90 days back at midnight UTC, day buckets", () => {
    const r = resolveRange("90d", NOW);
    expect(r.start?.toISOString()).toBe("2026-04-03T00:00:00.000Z");
    expect(r.bucket).toBe("day");
  });
  it("all has no start bound and month buckets", () => {
    const r = resolveRange("all", NOW);
    expect(r.start).toBeNull();
    expect(r.bucket).toBe("month");
  });
});

describe("formatters", () => {
  it("formats USD to 2dp", () => {
    expect(formatUsd(0.2)).toBe("$0.20");
    expect(formatUsd(12.3)).toBe("$12.30");
  });
  it("formats token counts compactly", () => {
    expect(formatTokens(940)).toBe("940");
    expect(formatTokens(12300)).toBe("12.3k");
    expect(formatTokens(4_100_000)).toBe("4.1M");
  });
});
