import { describe, expect, it } from "vitest";

import { isArchivedProject, isCurrentProject } from "./visibility";

describe("project visibility", () => {
  it("keeps live project statuses in the working portfolio", () => {
    for (const status of ["proposal", "planning", "active", "on_hold"]) {
      expect(isCurrentProject({ status })).toBe(true);
      expect(isArchivedProject({ status })).toBe(false);
    }
  });

  it("archives completed and cancelled projects", () => {
    for (const status of ["completed", "cancelled"]) {
      expect(isCurrentProject({ status })).toBe(false);
      expect(isArchivedProject({ status })).toBe(true);
    }
  });

  it("resurfaces a completed title while its reprint is active", () => {
    const project = { status: "completed", activeReprintStatus: "quoting" };
    expect(isCurrentProject(project)).toBe(true);
    expect(isArchivedProject(project)).toBe(false);
  });
});
