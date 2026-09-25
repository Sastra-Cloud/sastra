import { describe, expect, it } from "vitest";

import { allCoveredProjectsComplete } from "./mou-payments";

describe("shared agreement completion payments", () => {
  it("waits until every covered project is complete", () => {
    expect(allCoveredProjectsComplete(["completed", "active"])).toBe(false);
    expect(allCoveredProjectsComplete(["completed", "completed"])).toBe(true);
  });

  it("preserves ordinary single-project payment behavior", () => {
    expect(allCoveredProjectsComplete([])).toBe(true);
  });
});
