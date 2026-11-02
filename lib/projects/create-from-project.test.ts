import { getTableName } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

// Protect the new-project write boundary: no historical completion/funding, tasks, or
// assignments may leak into a sequel, and a failure cannot save a shell.
const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(), select: vi.fn(), transaction: vi.fn(),
  data: {} as Record<string, unknown[]>,
  committed: [] as { table: string; rows: Record<string, unknown>[] }[],
  failTable: "", duplicate: false,
}));
vi.mock("@/lib/auth/guards", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/db", () => ({ db: { select: mocks.select, transaction: mocks.transaction } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/slug", () => ({ uniqueProjectSlug: vi.fn(async () => "new-volume") }));
vi.mock("@/lib/workspace/queries", () => ({ getWorkspaceSettings: vi.fn(async () => ({
  sourceLanguage: "Workspace source", targetLanguage: "Workspace target",
  defaultCurrency: "EUR", wordsPerPage: 200, defaultFundingDeductionBps: 500,
  rateTranslation: "0.02", rateProofreading: "0.01", rateEditing: "0.02",
  rateCoverDesign: "100", rateTypesetting: "2", rateProjectManagement: "100",
  ratePrintShip: "500", rateAudiobook: "0.02", rateVideoSeries: "0.02",
  trimWidthIn: "6", trimHeightIn: "9", languageExpansionFactor: "1.2",
  financialEmail: "", defaultCcEmails: [],
})) }));

import { createProjectFromExisting, previewProjectFromExisting } from "./create-from-project";
import { buildProjectCopyRows, type ProjectCopyStructure } from "./project-copy";
import { parseToolArgs } from "@/lib/assistant/agent-util";
import { getTool, type ToolContext } from "@/lib/assistant/tools";

const sourceId = "00000000-0000-4000-8000-000000000001";
const input = { sourceProjectId: sourceId, title: "New volume" };
const ctx: ToolContext = { userId: "manager", role: "manager", timezone: "UTC" };

function sourceFixture(): ProjectCopyStructure {
  // Extra historical fields deliberately exercise the insert allowlists.
  return {
    project: { id: sourceId, title: "Previous volume", kind: "book", status: "completed",
      sourceLanguage: "Source override", targetLanguage: "Target override",
      videoProductionMode: null, videoRequired: true, estimatedDurationMonths: 4,
      description: "Series brief", priority: "high", royaltyPercentage: "5.00",
      driveFolderId: "old-folder", mouRequired: true, requiresRoyalties: true,
    },
    phases: [{ id: "phase-old", name: "Translation", orderIndex: 0, color: "blue",
      projectRoleId: "translator-role", durationDays: 7, startDate: "2020-01-01", dueDate: "2020-02-01" }],
    units: [{ id: "unit-old", name: "Old introduction", orderIndex: 0,
      ownerId: "old-owner", status: "published", scheduledDate: "2020-01-01", externalUrl: "https://example.org/old" }],
    budget: [{ id: "budget-old", group: "book_publishing", category: "translation", label: "Translation",
      unit: "words", quantity: "20000", unitPrice: "0.03", amount: "600", amountSecured: "600", amountSpent: "500",
      partnerUnitPrice: "0.05", partnerVisible: true, sortOrder: 0, isAutoQuantity: true, currency: "GBP", notes: "Old invoice" },
    { id: "budget-reprint", printRunId: "old-run", label: "Reprint" }],
  } as unknown as ProjectCopyStructure;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireRole.mockResolvedValue({ user: { id: "manager" } });
  mocks.committed = []; mocks.failTable = ""; mocks.duplicate = false;
  const source = sourceFixture();
  mocks.data = {
    projects: [source.project], phases: source.phases, units: source.units,
    tasks: [{ id: "old-task", assignedTo: "old-owner", status: "done" }],
    budget_items: source.budget.filter((line) => !line.printRunId),
    project_budget_settings: [{ currency: "GBP", wordsPerPage: 250, wordCount: 20000,
      rateTranslation: "0.03", partnerId: "old-partner", partnerContactEmail: "old@example.org", royaltyAmount: "100",
      royaltyTaskAssigneeId: "old-owner" }],
    project_print_settings: [{ trimWidthIn: "5.00", trimHeightIn: "8.00", measurementUnit: "cm", defaultContactId: "printer" }],
    budget_scope_presentations: [{ mode: "per_copy", deductionBps: 700, perCopyQuantity: 2000, perCopyUnitPrice: "5.00" }],
  };
  mocks.select.mockImplementation((fields) => ({ from: (table: Parameters<typeof getTableName>[0]) => {
    const name = getTableName(table);
    const data = name === "projects" && fields ? (mocks.duplicate ? [{ id: "duplicate" }] : []) : mocks.data[name] ?? [];
    const query = { where: () => query, orderBy: () => query, limit: () => query,
      then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(data).then(resolve) };
    return query;
  } }));
  mocks.transaction.mockImplementation(async (callback) => {
    const staged: typeof mocks.committed = [];
    const result = await callback({ select: mocks.select, insert: (table: Parameters<typeof getTableName>[0]) => ({
      values: async (value: Record<string, unknown> | Record<string, unknown>[]) => {
        const name = getTableName(table);
        if (mocks.failTable === name) throw new Error("Insert failed");
        staged.push({ table: name, rows: Array.isArray(value) ? value : [value] });
      },
    }) });
    mocks.committed = staged;
    return result;
  });
});

it("copies phases, unit names and budget estimates while clearing historical state", () => {
  const rows = buildProjectCopyRows(sourceFixture(), "new-project", true);
  expect(rows.units).toEqual([expect.objectContaining({ name: "Old introduction", projectId: "new-project" })]);
  expect(rows.units[0].id).not.toBe("unit-old");
  expect(rows.phases[0]).toMatchObject({ name: "Translation", durationDays: 7 });
  expect(rows.budget).toEqual([expect.objectContaining({ unitPrice: "0.03", partnerUnitPrice: "0.05",
    quantity: "20000", amount: "600.00", amountSpent: "0", amountSecured: "0", currency: "GBP" })]);
  expect(rows).not.toHaveProperty("tasks");
  expect(rows.units[0]).not.toHaveProperty("ownerId");
  expect(rows.units[0]).not.toHaveProperty("status");
  expect(rows.units[0]).not.toHaveProperty("externalUrl");
  expect(rows.phases[0]).not.toHaveProperty("dueDate");
});

it("only writes after preview/approval and returns the created project's id and URL", async () => {
  const tool = getTool("create_project_from_existing")!;
  const args = { ...input };
  const preview = await tool.preview!(ctx, args);
  expect(preview).toContain("Previous volume");
  expect(preview).toContain("no tasks or people assigned");
  expect(preview).toContain("GBP 600.00");
  expect(mocks.transaction).not.toHaveBeenCalled();
  const result = JSON.parse(await tool.run(ctx, parseToolArgs(JSON.stringify(args), tool.parameters)));
  expect(result).toMatchObject({ created: true, title: "New volume", url: "/projects/new-volume",
    status: "proposal", unitCount: 1, taskCount: 0, budgetLineCount: 1, budgetCopiedAsEstimate: true });
  const project = mocks.committed.find((entry) => entry.table === "projects")!.rows[0];
  expect(project).toMatchObject({ id: result.projectId, sourceLanguage: "Source override", targetLanguage: "Target override",
    status: "proposal", startDate: null, dueDate: null, description: "Series brief",
    requiresRoyalties: true, royaltyPercentage: "5.00", priority: "high" });
  expect(project).not.toHaveProperty("driveFolderId");
  const settings = mocks.committed.find((entry) => entry.table === "project_budget_settings")!.rows[0];
  expect(settings).toMatchObject({ rateTranslation: "0.03", currency: "GBP" });
  expect(settings).toMatchObject({ partnerId: "old-partner", wordCount: 20000, royaltyAmount: "100" });
  expect(settings).not.toHaveProperty("royaltyTaskAssigneeId");
  expect(mocks.committed.find((entry) => entry.table === "project_print_settings")!.rows[0])
    .toMatchObject({ trimWidthIn: "5.00", measurementUnit: "cm", defaultContactId: "printer" });
  expect(mocks.committed.find((entry) => entry.table === "budget_scope_presentations")!.rows[0])
    .toMatchObject({ mode: "per_copy", deductionBps: 700, perCopyQuantity: 2000 });
  expect(mocks.committed.map((entry) => entry.table)).toEqual([
    "projects", "project_budget_settings", "budget_scope_presentations", "project_print_settings",
    "phases", "units", "budget_items", "chat_channels", "activity_log",
  ]);
});

it("rejects stale approval and duplicate titles before inserting anything", async () => {
  const preview = await previewProjectFromExisting(input);
  mocks.data.budget_items = [...mocks.data.budget_items, { ...sourceFixture().budget[0], id: "new-line", label: "Added after preview" }];
  await expect(createProjectFromExisting(input, preview.fingerprint)).rejects.toThrow("fresh project preview");
  expect(mocks.committed).toEqual([]);
  const fresh = await previewProjectFromExisting(input);
  mocks.duplicate = true;
  await expect(createProjectFromExisting(input, fresh.fingerprint)).rejects.toThrow("already exists");
  expect(mocks.committed).toEqual([]);
});

it("rolls back the entire project if budget creation fails", async () => {
  const preview = await previewProjectFromExisting(input);
  mocks.failTable = "budget_items";
  await expect(createProjectFromExisting(input, preview.fingerprint)).rejects.toThrow("Insert failed");
  expect(mocks.committed).toEqual([]);
});

it("can omit budget reuse and uses workspace defaults for the new settings", async () => {
  mocks.data.projects = [{ ...sourceFixture().project, kind: "podcast" }];
  mocks.data.podcast_stage_settings = [{ stage: "write_script", daysBeforePublication: 12, defaultAssigneeId: "old-owner" }];
  const noBudget = { ...input, copyBudget: false };
  const preview = await previewProjectFromExisting(noBudget);
  await createProjectFromExisting(noBudget, preview.fingerprint);
  expect(mocks.committed.some((entry) => entry.table === "budget_items")).toBe(false);
  expect(mocks.committed.find((entry) => entry.table === "project_budget_settings")!.rows[0])
    .toMatchObject({ currency: "EUR", rateTranslation: "0.02" });
  expect(mocks.committed.find((entry) => entry.table === "podcast_stage_settings")!.rows)
    .toEqual([{ projectId: expect.any(String), stage: "write_script", daysBeforePublication: 12 }]);
  expect(mocks.committed.some((entry) => entry.table === "tasks" || entry.table === "project_members")).toBe(false);
});

it("enforces manager authorization for both source preview and creation", async () => {
  mocks.requireRole.mockRejectedValue(new Error("Forbidden"));
  await expect(previewProjectFromExisting(input)).rejects.toThrow("Forbidden");
  await expect(createProjectFromExisting(input, "token")).rejects.toThrow("Forbidden");
  expect(mocks.requireRole).toHaveBeenCalledWith("manager");
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.transaction).not.toHaveBeenCalled();
});
