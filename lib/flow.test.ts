import { describe, expect, it } from "vitest";

import {
  activeProjectCoordinationLimit,
  MIN_ACTIVE_PROJECT_COORDINATION_LIMIT,
} from "./flow";

describe("activeProjectCoordinationLimit", () => {
  it("keeps a small-team floor", () => {
    expect(activeProjectCoordinationLimit(0)).toBe(
      MIN_ACTIVE_PROJECT_COORDINATION_LIMIT
    );
    expect(activeProjectCoordinationLimit(3)).toBe(
      MIN_ACTIVE_PROJECT_COORDINATION_LIMIT
    );
  });

  it("scales project coordination review with team size", () => {
    expect(activeProjectCoordinationLimit(11)).toBe(17);
  });
});
