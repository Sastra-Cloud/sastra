import { describe, expect, it } from "vitest";

import { serializeActivityTimestamp } from "./activity-time";

describe("serializeActivityTimestamp", () => {
  it("serializes decoded Date values", () => {
    expect(
      serializeActivityTimestamp(new Date("2026-07-21T18:30:00.000Z"))
    ).toBe("2026-07-21T18:30:00.000Z");
  });

  it("serializes raw Postgres aggregate timestamp strings", () => {
    expect(serializeActivityTimestamp("2026-07-21 18:30:00")).toBe(
      "2026-07-21T18:30:00.000Z"
    );
  });

  it("returns null for absent or invalid timestamps", () => {
    expect(serializeActivityTimestamp(null)).toBeNull();
    expect(serializeActivityTimestamp("not-a-timestamp")).toBeNull();
  });
});
