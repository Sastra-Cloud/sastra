import { describe, expect, it, vi } from "vitest";

import {
  normalizeProjectPortfolioQuery,
  projectPortfolioLimits,
  queryProjectPortfolio,
  type BaseProjectRow,
  type ProjectQuerySource,
} from "./project-queries";

function project(overrides: Partial<BaseProjectRow> = {}): BaseProjectRow {
  return {
    id: "project-1",
    slug: "the-project",
    title: "The Project",
    kind: "book",
    printFundingStatus: "no_funding",
    status: "active",
    priority: "high",
    sourceLanguage: "English",
    targetLanguage: "Khmer",
    description: "A translated book project.",
    dueDate: "2026-09-01",
    effectiveDeadline: "2026-08-01",
    healthStatus: "red",
    healthComputedAt: new Date("2026-07-01T00:00:00Z"),
    rightsId: "rights-1",
    agreementType: "mou_plus_license",
    mouStatus: "signed",
    licenseStatus: "in_progress",
    rightsOverall: "in_progress",
    rightsCompleteBy: "2026-08-01",
    mouHolder: "Publisher",
    licenseHolder: "Crossway",
    ...overrides,
  };
}

function source(rows: BaseProjectRow[] = [project()]): ProjectQuerySource {
  return {
    listBase: vi.fn().mockResolvedValue(rows),
    listTaskCounts: vi
      .fn()
      .mockResolvedValue([{ projectId: "project-1", total: 8, done: 3 }]),
    listMembers: vi.fn().mockResolvedValue([
      { projectId: "project-1", name: "Sam", role: "Editor" },
    ]),
    listBlockers: vi.fn().mockResolvedValue([
      {
        projectId: "project-1",
        title: "License outstanding",
        type: "rights",
        severity: "critical",
      },
    ]),
    listActiveReprints: vi.fn().mockResolvedValue([]),
  };
}

describe("normalizeProjectPortfolioQuery", () => {
  it("uses bounded economical defaults and cleans invalid values", () => {
    expect(
      normalizeProjectPortfolioQuery({
        projectText: "  Project   name  ",
        statuses: ["active", "active", "bogus"],
        printFundingStatuses: ["no_funding", "no_funding", "bogus"],
        targetLanguage: "  Khmer ",
        dueBefore: "2026-02-31",
        limit: 999,
      })
    ).toMatchObject({
      projectText: "Project name",
      statuses: ["active"],
      printFundingStatuses: ["no_funding"],
      targetLanguage: "Khmer",
      scope: "open",
      sort: "title",
      detail: "summary",
      limit: 50,
      dueBefore: undefined,
    });
  });

  it("returns and filters the explicit book print-funding status", async () => {
    const fake = source();
    const result = await queryProjectPortfolio(
      {
        kinds: ["book"],
        printFundingStatuses: ["no_funding", "seeking_funding"],
        sort: "print_funding",
      },
      { role: "member", timezone: "UTC" },
      fake
    );

    expect(fake.listBase).toHaveBeenCalledWith(
      expect.objectContaining({
        kinds: ["book"],
        printFundingStatuses: ["no_funding", "seeking_funding"],
        sort: "print_funding",
      }),
      expect.any(String),
      false
    );
    expect(result.projects[0]).toMatchObject({
      title: "The Project",
      printFundingStatus: "no_funding",
    });
  });
});

describe("queryProjectPortfolio", () => {
  it("omits manager-only health and blockers for members", async () => {
    const fake = source();
    const result = await queryProjectPortfolio(
      { health: ["red"], sort: "health", detail: "operations" },
      { role: "member", timezone: "UTC" },
      fake
    );

    expect(fake.listBase).toHaveBeenCalledWith(
      expect.objectContaining({ health: [], sort: "title", detail: "summary" }),
      expect.any(String),
      false
    );
    expect(fake.listBlockers).not.toHaveBeenCalled();
    expect(result.projects[0]).not.toHaveProperty("health");
    expect(result.projects[0]).not.toHaveProperty("blockers");
    expect(result.warnings.join(" ")).toContain("manager-only");
  });

  it("returns rights detail for a rights-filtered portfolio question", async () => {
    const fake = source();
    const result = await queryProjectPortfolio(
      { licenseHolder: "Crossway", licenseState: "incomplete" },
      { role: "manager", timezone: "America/Los_Angeles" },
      fake
    );

    expect(result.detail).toBe("rights");
    expect(fake.listBase).toHaveBeenCalledWith(
      expect.objectContaining({
        licenseHolder: "Crossway",
        licenseState: "incomplete",
      }),
      expect.any(String),
      false
    );
    expect(result.projects[0]).toMatchObject({
      title: "The Project",
      progress: { done: 3, total: 8 },
      rights: {
        overallStatus: "in_progress",
        license: { holder: "Crossway", status: "in_progress" },
      },
    });
    expect(fake.listMembers).not.toHaveBeenCalled();
    expect(fake.listBlockers).not.toHaveBeenCalled();
  });

  it("returns operational health to managers without loading unrelated facets", async () => {
    const fake = source();
    const result = await queryProjectPortfolio(
      { health: ["red", "amber"] },
      { role: "manager", timezone: "UTC" },
      fake
    );

    expect(result.detail).toBe("operations");
    expect(result.projects[0]).toMatchObject({
      health: "red",
      blockers: [{ title: "License outstanding", severity: "critical" }],
    });
    expect(fake.listBlockers).toHaveBeenCalledOnce();
    expect(fake.listMembers).not.toHaveBeenCalled();
  });

  it("keeps full non-sensitive project detail available to members", async () => {
    const fake = source();
    const result = await queryProjectPortfolio(
      { projectText: "The Project", detail: "full", limit: 5 },
      { role: "member", timezone: "UTC" },
      fake
    );

    expect(result.detail).toBe("full");
    expect(result.projects[0]).toMatchObject({
      sourceLanguage: "English",
      targetLanguage: "Khmer",
      description: "A translated book project.",
      team: [{ name: "Sam", role: "Editor" }],
      rights: { overallStatus: "in_progress" },
    });
    expect(result.projects[0]).not.toHaveProperty("health");
    expect(fake.listBlockers).not.toHaveBeenCalled();
  });

  it("caps rows and serialized output size", async () => {
    const rows = Array.from({ length: 60 }, (_, index) =>
      project({
        id: `project-${index}`,
        slug: `project-${index}`,
        title: `${index}-${"x".repeat(1800)}`,
      })
    );
    const result = await queryProjectPortfolio(
      { scope: "all", limit: 50 },
      { role: "manager", timezone: "UTC" },
      source(rows)
    );

    expect(result.projects.length).toBeLessThanOrEqual(50);
    expect(result.truncated).toBe(true);
    expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThanOrEqual(
      projectPortfolioLimits.maxResultBytes
    );
  });
});
