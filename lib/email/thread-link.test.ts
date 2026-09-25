import { describe, expect, it } from "vitest";

import { nextPrimaryProjectId } from "./thread-link";

describe("nextPrimaryProjectId", () => {
  it("keeps the primary when a non-primary link is removed", () => {
    expect(nextPrimaryProjectId("a", "b", ["a", "c"])).toBe("a");
  });

  it("promotes the oldest remaining link when the primary is removed", () => {
    // remaining is passed oldest-first
    expect(nextPrimaryProjectId("a", "a", ["b", "c"])).toBe("b");
  });

  it("clears the primary when the last link is removed", () => {
    expect(nextPrimaryProjectId("a", "a", [])).toBeNull();
  });

  it("leaves a null primary null", () => {
    expect(nextPrimaryProjectId(null, "a", ["b"])).toBeNull();
  });
});
