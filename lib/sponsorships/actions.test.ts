import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), module: vi.fn(), select: vi.fn(), insert: vi.fn(), update: vi.fn(), remove: vi.fn(), pdf: vi.fn(), put: vi.fn(), nextNumber: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireRole: mocks.auth }));
vi.mock("@/lib/workspace/module-guard", () => ({ requireWorkspaceModule: mocks.module }));
vi.mock("@/lib/budget/invoice-number", () => ({ nextInvoiceNumber: mocks.nextNumber }));
vi.mock("@/lib/budget/pdf", () => ({ buildInvoicePdf: mocks.pdf }));
vi.mock("@/lib/r2", () => ({ buildKey: () => "invoice.pdf", deleteObject: vi.fn(), getObjectBuffer: vi.fn(), putObject: mocks.put }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/db", () => {
  const db = { select: mocks.select, insert: mocks.insert, update: mocks.update, delete: mocks.remove, transaction: (work: (tx: unknown) => unknown) => work(db) };
  return { db };
});
import { generateSponsorshipInvoice, recordSponsorshipFundUse, recordSponsorshipReceipt, reverseSponsorshipReceipt, updateSponsorship, voidSponsorshipInvoice } from "./actions";

const id = "00000000-0000-4000-8000-000000000001";
const invoiceId = "00000000-0000-4000-8000-000000000002";
const requestId = "00000000-0000-4000-8000-000000000003";
const bookId = "00000000-0000-4000-8000-000000000004";
const otherBookId = "00000000-0000-4000-8000-000000000005";
const record = { id, title: "Books", status: "invoiced", version: 1, currency: "USD", deductionBps: 0 };
const invoice = { id: invoiceId, status: "issued", invoiceNumber: "00001", currency: "USD", recipientName: "Partner",
  lineItems: [{ projectId: bookId, quantity: 250, unitPrice: "2.00" }, { projectId: otherBookId, quantity: 250, unitPrice: "2.00" }] };
const receipt = { id: requestId, invoiceId, amount: "1000.00", actualNetAmount: "1000.00", receivedDate: "2026-10-05", note: "" };
let selections: unknown[][];
let writes: Array<{ table: string; value: Record<string, unknown> | Array<Record<string, unknown>> }>;
function query(rows: unknown[]) {
  const result = {
    from: () => result, where: vi.fn(), innerJoin: () => result, orderBy: () => result,
    for: vi.fn(() => result), limit: () => result,
    then: (resolve: (rows: unknown[]) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(rows).then(resolve, reject),
  };
  result.where.mockReturnValue(result);
  return result;
}
beforeEach(() => {
  vi.clearAllMocks(); selections = []; writes = [];
  mocks.auth.mockResolvedValue({ user: { id: "manager" } });
  mocks.module.mockResolvedValue({ defaultFundingDeductionBps: 0, timezone: "UTC", orgName: "Workspace", legalName: "Workspace", contactEmail: "issuer@example.test", paymentInstructions: "Bank transfer" });
  mocks.select.mockImplementation(() => query(selections.shift() ?? []));
  mocks.insert.mockImplementation(table => ({ values: (value: Record<string, unknown>) => {
    writes.push({ table: getTableName(table), value });
    return { returning: async () => [{ id: requestId }], then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve([]).then(resolve) };
  } }));
  mocks.update.mockImplementation(table => ({ set: (value: Record<string, unknown>) => {
    writes.push({ table: getTableName(table), value });
    return { where: () => query([]) };
  } }));
  mocks.remove.mockImplementation(() => ({ where: () => query([]) }));
  mocks.pdf.mockResolvedValue(Buffer.from("%PDF-test")); mocks.put.mockResolvedValue(undefined); mocks.nextNumber.mockResolvedValue("00001");
});

describe("sponsorship book validation", () => {
  const input = { title: "Book sponsorship", partnerId: null, recipientName: "Partner", recipientEmail: "",
    recipientAddress: "", currency: "USD", dueDate: "", notes: "",
    lines: [{ projectId: bookId, description: "Book sponsorship", quantity: 1, unitPrice: "2.00" }] };

  it("allows saving an eligible book and includes untyped projects in the eligibility query", async () => {
    const eligibleBooks = query([{ id: bookId }]);
    mocks.select.mockImplementationOnce(() => query([{ ...record, status: "draft" }]))
      .mockImplementationOnce(() => eligibleBooks);

    expect(await updateSponsorship(id, 1, input)).toEqual({ version: 2 });
    const eligibility = new PgDialect().sqlToQuery(eligibleBooks.where.mock.calls[0][0]);
    expect(eligibility.sql).toBe('("projects"."id" in ($1) and ("projects"."kind" = $2 or "projects"."kind" is null))');
    expect(eligibility.params).toEqual([bookId, "book"]);
    expect(writes).toContainEqual({ table: "sponsorship_lines", value: [expect.objectContaining({ projectId: bookId })] });
    expect(mocks.revalidate).toHaveBeenCalledWith(`/sponsorships/${id}`);
  });

  it("rejects a missing or ineligible project before changing a draft", async () => {
    selections.push([{ ...record, status: "draft" }], []);
    expect(await updateSponsorship(id, 1, input)).toEqual({ error: "Select an existing book for every line." });
    expect(writes).toEqual([]);
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});

describe("sponsorship funding boundaries", () => {
  it("allocates the two-book payment without writing to project budget ledgers", async () => {
    selections.push([record], [], [invoice], [], []);
    expect(await recordSponsorshipReceipt(id, receipt)).toEqual({});
    const allocations = writes.filter(row => row.table === "sponsorship_receipt_allocations");
    expect(allocations.map(row => row.value)).toEqual([
      expect.objectContaining({ projectId: bookId, amount: "500.00", actualNetAmount: "500.00" }),
      expect.objectContaining({ projectId: otherBookId, amount: "500.00", actualNetAmount: "500.00" }),
    ]);
    expect(writes.map(row => row.table)).not.toContain("funding_receipts");
    expect(writes.map(row => row.table)).not.toContain("budget_items");
    expect(writes).toContainEqual({ table: "invoices", value: { status: "received" } });
  });
  it("rejects overpayments without writing anything", async () => {
    selections.push([record], [], [invoice], [{ projectId: bookId, amount: "500.00" }]);
    expect((await recordSponsorshipReceipt(id, receipt)).error).toContain("exceeds");
    expect(writes).toEqual([]);
  });
  it("treats an identical retried payment as already saved", async () => {
    selections.push([record], [{ ...receipt, sponsorshipId: id, note: null, reversedAt: null }]);
    expect(await recordSponsorshipReceipt(id, receipt)).toEqual({});
    expect(writes).toEqual([]);
  });
  it("records a partial use after checking this book's available balance", async () => {
    selections.push([record], [], [{ amount: "500.00" }], [{ amount: "125.00" }], []);
    expect(await recordSponsorshipFundUse(id, { id: requestId, projectId: bookId, amount: "100.00", usedDate: "2026-10-05", note: "Reprint deposit" })).toEqual({});
    expect(writes).toContainEqual({ table: "sponsorship_fund_uses", value: expect.objectContaining({ amount: "100.00", projectId: bookId, note: "Reprint deposit" }) });
    expect(writes.map(row => row.table)).not.toContain("funding_receipts");
  });
  it("rejects uses above the remaining reserve", async () => {
    selections.push([record], [], [{ amount: "500.00" }], [{ amount: "125.00" }]);
    expect((await recordSponsorshipFundUse(id, { id: requestId, projectId: bookId, amount: "400.00", usedDate: "2026-10-05", note: "Reprint" })).error).toContain("exceeds");
    expect(writes).toEqual([]);
  });
  it("does not reverse received money that has already been used", async () => {
    selections.push([record], [{ ...receipt, sponsorshipId: id }], [], [invoice], [{ projectId: bookId, actualNetAmount: "500.00" }],
      [{ projectId: bookId, actualNetAmount: "500.00" }], [{ projectId: bookId, amount: "125.00" }]);
    expect((await reverseSponsorshipReceipt(id, requestId, "Wrong payment")).error).toContain("funds were used");
    expect(writes).toEqual([]);
  });
  it("keeps imported sponsorship receipts linked to their donation", async () => {
    selections.push([record], [{ ...receipt, sponsorshipId: id }], [{ id: "donation-allocation" }]);
    expect((await reverseSponsorshipReceipt(id, requestId, "Wrong payment")).error).toContain("Donations page");
    expect(writes).toEqual([]);
  });
  it("protects invoice history while funding is received", async () => {
    selections.push([record], [invoice], [{ id: requestId }]);
    expect((await voidSponsorshipInvoice(id)).error).toContain("Reverse received funding");
    expect(writes).toEqual([]);
  });
  it("never creates an invoice after storage upload fails", async () => {
    selections.push([{ ...record, status: "draft" }], [{ projectId: bookId, quantity: 250, unitPrice: "2.00", description: "Book sponsorship" }]);
    mocks.put.mockRejectedValue(new Error("Storage unavailable"));
    await expect(generateSponsorshipInvoice(id, 1)).rejects.toThrow("Storage unavailable");
    expect(writes).toEqual([]);
  });
  it("requires manager authorization before reading or writing funds", async () => {
    mocks.auth.mockRejectedValue(new Error("Forbidden"));
    await expect(recordSponsorshipReceipt(id, receipt)).rejects.toThrow("Forbidden");
    expect(mocks.select).not.toHaveBeenCalled(); expect(writes).toEqual([]);
  });
  it("blocks funding actions when the module is disabled", async () => {
    mocks.module.mockRejectedValue(new Error("Module disabled"));
    await expect(recordSponsorshipFundUse(id, { id: requestId, projectId: bookId, amount: "1.00", usedDate: "2026-10-05", note: "Books" })).rejects.toThrow("Module disabled");
    expect(mocks.select).not.toHaveBeenCalled(); expect(writes).toEqual([]);
  });
});
