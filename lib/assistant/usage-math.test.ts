import { describe, expect, it } from "vitest";

import { resolveRange } from "./usage-math";

const NOW = new Date("2026-07-02T10:30:00Z");

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
