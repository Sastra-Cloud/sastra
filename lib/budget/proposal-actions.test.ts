import { getTableName } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";
import type { ProposalBudgetInput } from "./proposal-builder";

// A failed/retried save must not leave a project shell, duplicate budgets, or operational tasks.
const mocks = vi.hoisted(() => ({
  auth: vi.fn(), transaction: vi.fn(), committed: [] as Array<{ table: string; values: Record<string, unknown>[] }>,
  existing: false, fingerprint: "", failBudget: false,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireRole: mocks.auth }));
vi.mock("@/lib/slug", () => ({ uniqueProjectSlug: async () => "proposed-book" }));
vi.mock("@/lib/workspace/queries", () => ({ getWorkspaceSettings: async () => ({
  sourceLanguage: "workspace source", targetLanguage: "workspace target", defaultCurrency: "USD", wordsPerPage: 250,
  defaultFundingDeductionBps: 500, languageExpansionFactor: "2.00", rateTranslation: "0.02", rateProofreading: "0.01",
  rateEditing: "0.02", rateCoverDesign: "100", rateTypesetting: "2", rateProjectManagement: "100",
  ratePrintShip: "500", rateAudiobook: "0.02", rateVideoSeries: "0.02", trimWidthIn: "6", trimHeightIn: "9", defaultCcEmails: [],
}) }));
vi.mock("@/lib/db", () => ({ db: { transaction: mocks.transaction } }));
import { createProposalBudget } from "./proposal-actions";

const input: ProposalBudgetInput = {
  requestId: "10000000-0000-4000-8000-000000000001", title: "Proposed book", kind: "book", description: "Scope still under review",
  sourceLanguage: "", targetLanguage: "", currency: "EUR", wordCount: 12000, sourcePageCount: 80,
  wordsPerPage: 200, languageExpansionFactor: "1.50", lines: [
    { category: "translation", label: "Translation", unit: "words", quantity: 0, unitPrice: 0.0125, autoQuantity: true },
    { category: "typesetting", label: "Typesetting", unit: "pages", quantity: 0, unitPrice: 2.5, autoQuantity: true },
  ],
};
beforeEach(() => {
  vi.clearAllMocks(); mocks.existing = false; mocks.failBudget = false; mocks.committed = [];
  mocks.auth.mockResolvedValue({ user: { id: "manager" } });
  mocks.transaction.mockImplementation(async run => {
    const staged: typeof mocks.committed = [];
    const tx = {
      execute: vi.fn(),
      select: () => ({ from: (table: Parameters<typeof getTableName>[0]) => {
        const rows = getTableName(table) === "projects" ? (mocks.existing ? [{ id: input.requestId, slug: "proposed-book" }] : []) : [{ data: { fingerprint: mocks.fingerprint } }];
        return { where: () => Object.assign(Promise.resolve(rows), { limit: async () => rows }) };
      } }),
      insert: (table: Parameters<typeof getTableName>[0]) => ({ values: (value: Record<string, unknown> | Record<string, unknown>[]) => {
        const name = getTableName(table), values = Array.isArray(value) ? value : [value];
        if (name === "budget_items" && mocks.failBudget) throw new Error("budget insert failed");
        staged.push({ table: name, values });
        if (name === "activity_log") mocks.fingerprint = String((values[0].data as Record<string, unknown>).fingerprint);
        return Object.assign(Promise.resolve(), { returning: async () => [{ id: input.requestId }] });
      } }),
      update: (table: Parameters<typeof getTableName>[0]) => ({ set: (value: Record<string, unknown>) => ({ where: async () => { staged.push({ table: `${getTableName(table)}:update`, values: [value] }); } }) }),
    };
    const result = await run(tx); mocks.committed.push(...staged); return result;
  });
});

it("saves the reviewed estimate atomically as Proposal, without tasks, financial transactions, or a Lectio counterpart", async () => {
  expect(await createProposalBudget(input)).toMatchObject({ projectId: input.requestId, url: "/projects/proposed-book/budget" });
  const project = mocks.committed.find(row => row.table === "projects")!.values[0];
  expect(project).toMatchObject({ id: input.requestId, status: "proposal", sourceLanguage: "workspace source", startDate: null, dueDate: null });
  expect(mocks.committed.find(row => row.table === "project_budget_settings:update")!.values[0]).toMatchObject({ wordCount: 12000, wordsPerPage: 200, currency: "EUR" });
  expect(mocks.committed.find(row => row.table === "project_print_settings:update")!.values[0]).toEqual({ languageExpansionFactor: "1.50" });
  expect(mocks.committed.find(row => row.table === "budget_items")!.values).toMatchObject([
    { quantity: "12000.00", unitPrice: "0.0125", amount: "150.00", amountSecured: "0", amountSpent: "0", currency: "EUR" },
    { quantity: "120.00", amount: "300.00" },
  ]);
  expect(mocks.committed.some(row => ["tasks", "phases", "funding_receipts", "mou_payments", "lectio_project_links"].includes(row.table))).toBe(false);
  const count = mocks.committed.length;
  mocks.existing = true;
  expect(await createProposalBudget(input)).toHaveProperty("projectId", input.requestId);
  expect(mocks.committed).toHaveLength(count);
  expect(await createProposalBudget({ ...input, title: "Changed draft" })).toHaveProperty("error");
});

it("preserves the draft and rolls back the native shell if saving budget lines fails", async () => {
  mocks.failBudget = true;
  expect(await createProposalBudget(input)).toHaveProperty("error");
  expect(mocks.committed).toEqual([]);
});

it("rejects unauthorized creators before any transaction", async () => {
  mocks.auth.mockRejectedValue(new Error("Forbidden"));
  await expect(createProposalBudget(input)).rejects.toThrow("Forbidden");
  expect(mocks.transaction).not.toHaveBeenCalled();
});
