import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";

const mocks = vi.hoisted(() => ({ select: vi.fn(), update: vi.fn(), insert: vi.fn(), transaction: vi.fn(), auth: vi.fn(), execute: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: mocks }));
vi.mock("@/lib/auth/guards", () => ({ requireDonationAdmin: mocks.auth }));
vi.mock("@/lib/workspace/module-guard", () => ({ requireWorkspaceModule: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/agreements/readiness-engine", () => ({ reevaluateSharedMouPayments: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { confirmDonationMouPaymentMatch } from "./actions";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const input = { allocationId: id(1), paymentId: id(2), expectedPaymentAmount: 2530, expectedReceiptAmount: 2605.9, differenceReason: "The partner added to this installment." };
const original = {
  donationId: id(3), allocationProjectId: id(4), allocationAmount: "2605.90",
  currentPaymentId: null, allocationInvoiceId: null, allocationSharedGroupId: null,
  receiptId: id(5), receiptProjectId: id(4), receiptPrintRunId: null,
  receiptAmount: "2605.90", receiptCurrency: "USD", donationCurrency: "USD",
  donationDate: "2024-11-24", paymentProjectId: id(4), paymentPrintRunId: null,
  paymentAmount: "2530.00", paymentCurrency: "USD", paymentPaidAt: null,
  paymentReceiptId: null, sharedMouGroupId: null,
};
let match: typeof original;
let writes: Array<{ table: string; value: Record<string, unknown> }>;
let failAudit: boolean;
let losePaymentRace: boolean;
function query(rows: unknown[]) {
  const result = { from: () => result, innerJoin: () => result, where: () => result, limit: () => result,
    returning: async () => rows, then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve) };
  return result;
}
beforeEach(() => {
  vi.clearAllMocks();
  match = { ...original };
  writes = [];
  failAudit = false;
  losePaymentRace = false;
  mocks.auth.mockResolvedValue({ user: { id: "admin" } });
  mocks.execute.mockResolvedValue([]);
  mocks.select.mockReset();
  mocks.select.mockImplementationOnce(() => query([match])).mockImplementationOnce(() => query([{
    allocationId: input.allocationId, projectId: id(4), projectTitle: "Example project", amount: match.allocationAmount,
    mouPaymentId: null, sharedMouGroupId: null, invoiceId: null,
  }])).mockImplementation(() => query([{ slug: "example" }]));
  mocks.update.mockImplementation((table) => ({ set: (value: Record<string, unknown>) => {
    const name = getTableName(table);
    writes.push({ table: name, value });
    return { where: () => query(losePaymentRace && name === "mou_payments" ? [] : [{ id: id(2) }]) };
  } }));
  mocks.insert.mockImplementation((table) => ({ values: async (value: Record<string, unknown>) => {
    if (failAudit) throw new Error("Audit unavailable");
    writes.push({ table: getTableName(table), value });
  } }));
  mocks.transaction.mockImplementation(async (work) => {
    const previous = [...writes];
    try { return await work(mocks); }
    catch (error) { writes = previous; throw error; }
  });
});

describe("linking an existing donation to a different scheduled amount", () => {
  it("reuses the receipt, preserves both amounts, and audits the reviewed difference", async () => {
    expect(await confirmDonationMouPaymentMatch(input)).toEqual({});
    expect(writes.find((row) => row.table === "mou_payments")?.value).toMatchObject({ receiptId: id(5), readinessStatus: "received" });
    expect(writes.find((row) => row.table === "mou_payments")?.value).not.toHaveProperty("amount");
    expect(writes.map((row) => row.table)).toEqual(["mou_payments", "donation_allocations", "donation_reviews"]);
    const review = writes.find((row) => row.table === "donation_reviews")?.value;
    expect(review?.reason).toContain("Scheduled USD 2530.00; received USD 2605.90; difference 75.90");
    expect(review?.nextAllocations).toEqual([expect.objectContaining({ amount: "2605.90", mouPaymentId: input.paymentId })]);
  });
  it("requires a reason and the reviewed amounts for a difference", async () => {
    expect((await confirmDonationMouPaymentMatch({ allocationId: input.allocationId, paymentId: input.paymentId })).error).toContain("Review both amounts");
    expect(writes).toEqual([]);
  });
  it("rejects a scheduled amount changed after the review", async () => {
    match.paymentAmount = "2550.00";
    expect((await confirmDonationMouPaymentMatch(input)).error).toContain("An amount changed");
    expect(writes).toEqual([]);
  });
  it("rejects linking another project's payment even with a reviewed reason", async () => {
    match.paymentProjectId = id(99);
    expect((await confirmDonationMouPaymentMatch(input)).error).toContain("same project");
    expect(writes).toEqual([]);
  });
  it.each([
    ["another currency", { paymentCurrency: "EUR" }],
    ["another print run", { paymentPrintRunId: id(7) }],
    ["an existing invoice match", { allocationInvoiceId: id(8) }],
    ["a shared payment", { sharedMouGroupId: id(9) }],
  ])("rejects %s without changing either financial record", async (_label, patch) => {
    Object.assign(match, patch);
    expect((await confirmDonationMouPaymentMatch(input)).error).toBeTruthy();
    expect(writes).toEqual([]);
  });
  it("preserves the existing exact-match flow without requiring a difference reason", async () => {
    match.paymentAmount = match.receiptAmount;
    expect(await confirmDonationMouPaymentMatch({ allocationId: input.allocationId, paymentId: input.paymentId })).toEqual({});
    expect(writes.find((row) => row.table === "donation_reviews")?.value.reason).toContain("Exact project");
  });
  it("does not change funding when the payment was received during review", async () => {
    losePaymentRace = true;
    expect((await confirmDonationMouPaymentMatch(input)).error).toContain("another update");
    expect(writes).toEqual([]);
  });
  it("rolls back both links when saving the audit fails", async () => {
    failAudit = true;
    expect((await confirmDonationMouPaymentMatch(input)).error).toBe("Audit unavailable");
    expect(writes).toEqual([]);
  });
  it("makes retries idempotent after the receipt has been linked", async () => {
    Object.assign(match, { currentPaymentId: input.paymentId, paymentReceiptId: id(5), paymentPaidAt: new Date() });
    expect(await confirmDonationMouPaymentMatch(input)).toEqual({});
    expect(writes).toEqual([]);
  });
  it("requires a donation admin before reading or linking financial records", async () => {
    mocks.auth.mockRejectedValue(new Error("Forbidden"));
    await expect(confirmDonationMouPaymentMatch(input)).rejects.toThrow("Forbidden");
    expect(mocks.select).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });
});
