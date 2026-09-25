import { describe, expect, it } from "vitest";

import {
  PULL_REFRESH_MAX_DISTANCE,
  resistedPullDistance,
  shouldRefreshAfterPull,
} from "./pull-to-refresh";

describe("pull-to-refresh gesture", () => {
  it("ignores upward and invalid movement", () => {
    expect(resistedPullDistance(-20)).toBe(0);
    expect(resistedPullDistance(Number.NaN)).toBe(0);
  });

  it("adds resistance and caps the visible travel", () => {
    expect(resistedPullDistance(100)).toBe(42);
    expect(resistedPullDistance(1000)).toBe(PULL_REFRESH_MAX_DISTANCE);
  });

  it("arms only after the deliberate-pull threshold", () => {
    expect(shouldRefreshAfterPull(67)).toBe(false);
    expect(shouldRefreshAfterPull(68)).toBe(true);
  });
});
