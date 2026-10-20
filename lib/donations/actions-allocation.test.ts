import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  transaction: vi.fn(),
  auth: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    select: mocks.select,
    insert: mocks.insert,
    update: mocks.update,
    delete: mocks.remove,
    transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/auth/guards", () => ({ requireDonationAdmin: mocks.auth }));
vi.mock("@/lib/workspace/module-guard", () => ({
  requireWorkspaceModule: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/agreements/readiness-engine", () => ({
  reevaluateSharedMouPayments: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { confirmDonationAllocations } from "./actions";

const id = (last: number) =>
  `00000000-0000-4000-8000-${String(last).padStart(12, "0")}`;
const p1 = id(1),
  p2 = id(2),
  sponsorId = id(3),
  invoiceId = id(4),
  productionInvoiceId = id(5),
  donationId = id(6);
const donation = {
  id: donationId,
  amount: "1000.00",
  currency: "USD",
  reviewStatus: "needs_review",
  donor: "Review Partner",
  donationDate: "2026-10-19",
  notes: null,
};
const sponsor = { id: sponsorId, status: "invoiced", deductionBps: 1000 };
const invoice = {
  id: invoiceId,
  sponsorshipId: sponsorId,
  projectId: p1,
  invoiceNumber: "INV-SPONSOR",
  recipientName: "Review Partner",
  currency: "USD",
  status: "sent",
  amount: "700.00",
  mouPaymentId: null,
  sharedMouGroupId: null,
  lineItems: [
    { projectId: p1, quantity: 210, unitPrice: "2.00" },
    { projectId: p2, quantity: 140, unitPrice: "2.00" },
  ],
};
const production = {
  ...invoice,
  id: productionInvoiceId,
  sponsorshipId: null,
  projectId: p2,
  amount: "300.00",
  lineItems: null,
};
const projects = [
  { id: p1, title: "Book A" },
  { id: p2, title: "Book B" },
];
const input = {
  donationId,
  allocations: [
    { projectId: p1, amount: 420, actualNetAmount: 378, invoiceId },
    { projectId: p2, amount: 280, actualNetAmount: 252, invoiceId },
    { projectId: p2, amount: 300, invoiceId: productionInvoiceId },
  ],
};
let selections: unknown[][];
let writes: Array<{ table: string; value: Record<string, unknown> }>;
let failTable: string | null;
function query(rows: unknown[]) {
  const result = {
    from: () => result,
    innerJoin: () => result,
    where: () => result,
    orderBy: () => result,
    for: () => result,
    limit: () => result,
    then: (resolve: (value: unknown[]) => unknown) =>
      Promise.resolve(rows).then(resolve),
  };
  return result;
}
beforeEach(() => {
  vi.clearAllMocks();
  writes = [];
  failTable = null;
  selections = [
    [donation],
    [],
    projects,
    [],
    [invoice, production],
    [sponsor],
    [invoice, production],
    [],
    [],
    [],
    projects,
    [],
    [],
  ];
  mocks.auth.mockResolvedValue({ user: { id: "admin" } });
  mocks.select.mockImplementation(() => query(selections.shift() ?? []));
  mocks.insert.mockImplementation((table) => ({
    values: (value: Record<string, unknown>) => {
      const name = getTableName(table);
      writes.push({ table: name, value });
      if (name === failTable) throw new Error("Database unavailable");
      return {
        returning: async () => [{ id: id(10) }],
        then: (resolve: (value: unknown[]) => unknown) =>
          Promise.resolve([]).then(resolve),
      };
    },
  }));
  mocks.update.mockImplementation((table) => ({
    set: (value: Record<string, unknown>) => {
      writes.push({ table: getTableName(table), value });
      return { where: () => query([]) };
    },
  }));
  mocks.remove.mockImplementation(() => ({ where: () => query([]) }));
  mocks.transaction.mockImplementation(async (work) => {
    const previous = [...writes];
    try {
      return await work({
        select: mocks.select,
        insert: mocks.insert,
        update: mocks.update,
        delete: mocks.remove,
      });
    } catch (error) {
      writes = previous;
      throw error;
    }
  });
});
describe("posting combined donation invoice matches", () => {
  it("keeps a partially paid sponsorship invoice open", async () => {
    selections[0] = [{ ...donation, amount: "200.00" }];
    selections[4] = [invoice];
    selections[6] = [invoice];
    expect(await confirmDonationAllocations({ donationId, allocations: [
      { projectId: p1, amount: 120, actualNetAmount: 108, invoiceId },
      { projectId: p2, amount: 80, actualNetAmount: 72, invoiceId },
    ] })).toEqual({});
    expect(writes.filter(row => row.table === "sponsorship_receipts").map(row => row.value.amount)).toEqual(["200.00"]);
    expect(writes.filter(row => row.table === "funding_receipts")).toEqual([]);
    expect(writes.filter(row => row.table === "invoices")).toEqual([]);
    expect(writes).toContainEqual({ table: "donations", value: expect.objectContaining({ reviewStatus: "allocated" }) });
  });
  it("records sponsorship funds and production funding once in their separate ledgers", async () => {
    expect(await confirmDonationAllocations(input)).toEqual({});
    expect(
      writes
        .filter((row) => row.table === "funding_receipts")
        .map((row) => row.value.amount)
    ).toEqual(["300.00"]);
    expect(
      writes
        .filter((row) => row.table === "sponsorship_receipts")
        .map((row) => [row.value.amount, row.value.actualNetAmount])
    ).toEqual([["700.00", "630.00"]]);
    expect(
      writes
        .filter((row) => row.table === "sponsorship_receipt_allocations")
        .map((row) => [row.value.amount, row.value.actualNetAmount])
    ).toEqual([
      ["420.00", "378.00"],
      ["280.00", "252.00"],
    ]);
    const links = writes.filter((row) => row.table === "donation_allocations");
    expect(links).toHaveLength(3);
    expect(links.filter((row) => row.value.sponsorshipReceiptId)).toHaveLength(
      2
    );
    expect(links.filter((row) => row.value.fundingReceiptId)).toHaveLength(1);
    expect(writes.map((row) => row.table)).not.toContain("budget_items");
    expect(writes).toContainEqual({
      table: "donations",
      value: expect.objectContaining({ reviewStatus: "allocated" }),
    });
  });
  it("rolls the entire donation back when either funding ledger fails", async () => {
    failTable = "funding_receipts";
    await expect(confirmDonationAllocations(input)).rejects.toThrow(
      "Database unavailable"
    );
    expect(writes).toEqual([]);
  });
  it("leaves both ledgers untouched when an invoice was voided after review", async () => {
    selections[6] = [{ ...invoice, status: "void" }, production];
    expect((await confirmDonationAllocations(input)).error).toContain(
      "invoice balance"
    );
    expect(writes).toEqual([]);
  });
  it("requires donation admin authorization before reading or writing funding", async () => {
    mocks.auth.mockRejectedValue(new Error("Forbidden"));
    await expect(confirmDonationAllocations(input)).rejects.toThrow(
      "Forbidden"
    );
    expect(mocks.select).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });
});
