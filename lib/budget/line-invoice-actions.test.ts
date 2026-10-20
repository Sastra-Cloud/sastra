import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), budget: vi.fn(), details: vi.fn(), generate: vi.fn(),
  payment: null as Record<string, unknown> | null,
  invoice: null as Record<string, unknown> | null,
  writes: [] as Record<string, unknown>[],
}));
vi.mock("@/lib/auth/guards", () => ({ requireRole: mocks.auth }));
vi.mock("./queries", () => ({ getBudgetData: mocks.budget }));
vi.mock("./invoice-details", () => ({ getMouInvoiceDetails: mocks.details }));
vi.mock("./actions", () => ({ generateMouInvoice: mocks.generate }));
vi.mock("@/lib/db", async () => {
  const { getTableName } = await import("drizzle-orm");
  return { db: {
    select: () => ({ from: (table: Parameters<typeof getTableName>[0]) => {
      const name = getTableName(table);
      const query = {
        where: () => query, orderBy: () => query,
        limit: async () => name === "projects" ? [{ title: "Example book" }] :
          name === "mou_payments" ? mocks.payment ? [mocks.payment] : [] : mocks.invoice ? [mocks.invoice] : [],
      };
      return query;
    } }),
    insert: () => ({ values: (value: Record<string, unknown>) => ({ onConflictDoNothing: async () => {
      mocks.writes.push(value); mocks.payment ??= value;
    } }) }),
  } };
});

import { createBudgetLineInvoice, previewBudgetLineInvoice } from "./line-invoice-actions";

const input = {
  projectId: "00000000-0000-4000-8000-000000000001",
  budgetItemIds: ["00000000-0000-4000-8000-000000000002"],
};
const requestId = "00000000-0000-4000-8000-000000000003";
const budget = () => ({
  settings: { currency: "USD", partnerContactEmail: "partner@example.org" },
  items: [{ id: input.budgetItemIds[0], label: "Internal", partnerLabel: "Audiobook Production", partnerVisible: true, quantity: "59000", unitPrice: "0.008", partnerUnitPrice: "0.01" }],
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.payment = null; mocks.invoice = null; mocks.writes = [];
  mocks.auth.mockResolvedValue({ user: { id: "manager" } });
  mocks.budget.mockResolvedValue(budget());
  mocks.details.mockResolvedValue({ recipientName: "Partner", billingAddress: "Address" });
  mocks.generate.mockResolvedValue({ invoiceId: "invoice", invoiceNumber: "001" });
});

describe("reviewed budget invoice creation", () => {
  it("requires manager authorization for both preview and creation before any reads or writes", async () => {
    mocks.auth.mockRejectedValue(new Error("Forbidden"));
    await expect(previewBudgetLineInvoice(input)).rejects.toThrow("Forbidden");
    await expect(createBudgetLineInvoice({ ...input, requestId, reviewedFingerprint: "a".repeat(64) })).rejects.toThrow("Forbidden");
    expect(mocks.budget).not.toHaveBeenCalled();
    expect(mocks.writes).toEqual([]);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("does not create a payment when live prices change after review", async () => {
    const review = await previewBudgetLineInvoice(input);
    const changed = budget(); changed.items[0].partnerUnitPrice = "0.02";
    mocks.budget.mockResolvedValue(changed);
    const result = await createBudgetLineInvoice({ ...input, requestId, reviewedFingerprint: review.plan!.fingerprint });
    expect(result.error).toContain("changed");
    expect(mocks.writes).toEqual([]);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("keeps the same receivable and reviewed details through PDF failure and retries", async () => {
    const review = await previewBudgetLineInvoice(input);
    const request = { ...input, requestId, reviewedFingerprint: review.plan!.fingerprint };
    mocks.generate.mockRejectedValueOnce(new Error("Storage unavailable"));
    expect(await createBudgetLineInvoice(request)).toEqual({ error: "Storage unavailable", paymentId: requestId });
    expect(mocks.writes[0]).toMatchObject({ projectId: input.projectId, amount: "590.00", currency: "USD", trigger: "custom", budgetInvoice: { recipientName: "Partner" } });
    expect(mocks.writes[0].publicDescription).not.toContain("Internal");
    mocks.budget.mockResolvedValue({ ...budget(), settings: { currency: "EUR", partnerContactEmail: "changed@example.org" } });
    expect(await createBudgetLineInvoice(request)).toMatchObject({ paymentId: requestId, invoiceId: "invoice" });
    mocks.invoice = { id: "invoice", invoiceNumber: "001", status: "issued" };
    expect(await createBudgetLineInvoice(request)).toMatchObject({ invoiceId: "invoice" });
    expect(mocks.writes).toHaveLength(1);
    expect(mocks.generate).toHaveBeenCalledTimes(2);
    expect((await createBudgetLineInvoice({ ...request, amount: 50 })).error).toContain("changed");
    mocks.payment!.amount = "100.00";
    expect((await createBudgetLineInvoice(request)).error).toContain("changed");
    expect(mocks.writes).toHaveLength(1);
  });
});
