import { describe, expect, it } from "vitest";

import { orderProjectsByDashboardActivity } from "./dashboard-order";

type Project = {
  id: string;
  createdAt: string;
  updatedAt: string;
  latestInboundEmailAt: string | null;
  latestStatusUpdateAt: string | null;
};

function project(
  id: string,
  overrides: Partial<Omit<Project, "id">> = {}
): Project {
  const createdAt = overrides.createdAt ?? "2026-06-01T12:00:00.000Z";
  return {
    id,
    createdAt,
    updatedAt: overrides.updatedAt ?? createdAt,
    latestInboundEmailAt: overrides.latestInboundEmailAt ?? null,
    latestStatusUpdateAt: overrides.latestStatusUpdateAt ?? null,
  };
}

describe("orderProjectsByDashboardActivity", () => {
  it("bumps an older project when a newer inbound email is processed", () => {
    const projects = [
      project("new-project", { createdAt: "2026-07-20T12:00:00.000Z" }),
      project("emailed-project", {
        latestInboundEmailAt: "2026-07-21T12:00:00.000Z",
      }),
    ];

    expect(orderProjectsByDashboardActivity(projects).map((item) => item.id)).toEqual([
      "emailed-project",
      "new-project",
    ]);
  });

  it("does not let an old email outrank a project created later", () => {
    const projects = [
      project("new-project", { createdAt: "2026-07-20T12:00:00.000Z" }),
      project("old-email-project", {
        latestInboundEmailAt: "2026-06-15T12:00:00.000Z",
      }),
    ];

    expect(orderProjectsByDashboardActivity(projects).map((item) => item.id)).toEqual([
      "new-project",
      "old-email-project",
    ]);
  });

  it("bumps a project when a top-level status update is posted", () => {
    const projects = [
      project("new-project", { createdAt: "2026-07-20T12:00:00.000Z" }),
      project("status-project", {
        latestStatusUpdateAt: "2026-07-21T12:00:00.000Z",
      }),
    ];

    expect(orderProjectsByDashboardActivity(projects).map((item) => item.id)).toEqual([
      "status-project",
      "new-project",
    ]);
  });

  it("bumps a project after a deliberate project-level change", () => {
    const projects = [
      project("new-project", { createdAt: "2026-07-20T12:00:00.000Z" }),
      project("changed-project", {
        updatedAt: "2026-07-21T12:00:00.000Z",
      }),
    ];

    expect(orderProjectsByDashboardActivity(projects).map((item) => item.id)).toEqual([
      "changed-project",
      "new-project",
    ]);
  });

  it("keeps the existing order when activity timestamps are equal", () => {
    const projects = [
      project("first", { createdAt: "2026-07-20T12:00:00.000Z" }),
      project("second", { createdAt: "2026-07-20T12:00:00.000Z" }),
    ];

    expect(orderProjectsByDashboardActivity(projects).map((item) => item.id)).toEqual([
      "first",
      "second",
    ]);
  });
});
