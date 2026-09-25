import { describe, expect, it } from "vitest";

import { isNewerEntitlement } from "./entitlement-order";

describe("isNewerEntitlement", () => {
  const stored = new Date("2026-09-01T00:00:00Z");

  it("applies the first event and any later one", () => {
    expect(isNewerEntitlement(null, stored)).toBe(true);
    expect(isNewerEntitlement(stored, new Date("2026-09-02T00:00:00Z"))).toBe(true);
  });

  it("applies a re-issued event with the same effective time", () => {
    expect(isNewerEntitlement(stored, new Date(stored))).toBe(true);
  });

  it("ignores an event that took effect before the stored one, and bad dates", () => {
    expect(isNewerEntitlement(stored, new Date("2026-08-31T23:59:59Z"))).toBe(false);
    expect(isNewerEntitlement(stored, new Date("not a date"))).toBe(false);
  });
});
