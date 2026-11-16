import { getTableName } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ auth: vi.fn(), extract: vi.fn(), transaction: vi.fn(), select: vi.fn(),
  existing: null as Record<string, unknown> | null, committed: [] as { table: string; values: Record<string, unknown>[] }[], failQuotes: false }));
vi.mock("@/lib/auth/guards", () => ({ requireRole: m.auth }));
vi.mock("@/lib/print/email-text-extract", () => ({ extractTextQuoteSuggestions: m.extract }));
vi.mock("@/lib/print/queries", () => ({ getOrCreatePrintSettings: async () => ({ trimWidthIn: "6.00", trimHeightIn: "9.00" }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select: m.select, transaction: m.transaction } }));
import { createPrintEstimateFromText } from "./estimate-intake-actions";
import { parsePrinterQuoteTextVariants } from "./parser";

const projectId = "10000000-0000-4000-8000-000000000001";
const input = { requestId: "10000000-0000-4000-8000-000000000002", contactId: null, reused: true,
  text: "1000 cps @ USD 1.36 per cpy\n2000 cps @ USD 0.86 per cpy\n3000 cps @ USD 0.72 per cpy" };
beforeEach(() => {
  vi.clearAllMocks(); m.existing = null; m.committed = []; m.failQuotes = false;
  m.auth.mockResolvedValue({ user: { id: "manager" } });
  m.extract.mockResolvedValue({ quotes: parsePrinterQuoteTextVariants(input.text).map(quote => ({
    quote: { ...quote, kind: "invoice", invoiceNumber: "original-invoice", depositAmount: "500.00", balanceAmount: "860.00" }, flags: [], source: "ai",
  })) });
  m.select.mockReturnValue({ from: (table: Parameters<typeof getTableName>[0]) => {
    const name = getTableName(table);
    const rows = name === "projects" ? [{ id: projectId, title: "Planning book", slug: "planning-book" }]
      : name === "print_runs" ? (m.existing ? [m.existing] : [])
      : name === "print_quotes" ? [{ id: "q1" }, { id: "q2" }, { id: "q3" }] : [];
    return { where: () => Object.assign(Promise.resolve(rows), { limit: async () => rows }) };
  } });
  m.transaction.mockImplementation(async fn => {
    const staged: typeof m.committed = [];
    const result = await fn({ select: m.select, insert: (table: Parameters<typeof getTableName>[0]) => ({ values: (value: Record<string, unknown> | Record<string, unknown>[]) => {
      const name = getTableName(table);
      if (name === "print_quotes" && m.failQuotes) throw new Error("Write failed");
      const values = Array.isArray(value) ? value : [value]; staged.push({ table: name, values });
      return Object.assign(Promise.resolve(), { onConflictDoNothing: () => ({ returning: async () => [{ id: input.requestId }] }) });
    } }) });
    m.committed.push(...staged);
    m.existing = staged.find(row => row.table === "print_runs")?.values[0] ?? m.existing;
    return result;
  });
});

// Reused invoice text must never create a payable or alter the book budget before review.
it("atomically saves all planning tiers as suggestions, preserves provenance, and deduplicates a retried save", async () => {
  expect(await createPrintEstimateFromText(projectId, input)).toEqual({ runId: input.requestId, count: 3 });
  expect(m.auth).toHaveBeenCalledWith("manager");
  expect(m.committed.map(row => row.table)).toEqual(["print_runs", "print_quotes", "activity_log"]);
  expect(m.committed[0].values[0]).toMatchObject({ kind: "budget_estimate", status: "quote_received", printNumber: null, contactId: null });
  const quotes = m.committed[1].values;
  expect(quotes.map(quote => quote.quantityCps)).toEqual([1000, 2000, 3000]);
  expect(quotes.every(quote => quote.reviewStatus === "suggested" && quote.kind === "quote" && quote.invoiceNumber === null && quote.depositAmount === null && quote.balanceAmount === null)).toBe(true);
  expect(quotes[0].reviewFlags).toEqual([expect.objectContaining({ kind: "reused_quote" })]);
  expect(await createPrintEstimateFromText(projectId, input)).toEqual({ runId: input.requestId, count: 3 });
  expect(m.extract).toHaveBeenCalledTimes(1); expect(m.transaction).toHaveBeenCalledTimes(1);
  expect(await createPrintEstimateFromText(projectId, { ...input, text: "Changed source" })).toHaveProperty("error");
});

it("leaves no empty request or partial tiers after a failed write, and allows retry with the same input", async () => {
  m.failQuotes = true;
  expect(await createPrintEstimateFromText(projectId, input)).toHaveProperty("error");
  expect(m.committed).toEqual([]); expect(m.existing).toBeNull();
  m.failQuotes = false;
  expect(await createPrintEstimateFromText(projectId, input)).toHaveProperty("count", 3);
});

it("rejects non-managers before reading the project or spending AI credits", async () => {
  m.auth.mockRejectedValue(new Error("Forbidden"));
  await expect(createPrintEstimateFromText(projectId, input)).rejects.toThrow("Forbidden");
  expect(m.select).not.toHaveBeenCalled(); expect(m.extract).not.toHaveBeenCalled(); expect(m.transaction).not.toHaveBeenCalled();
});
