import { beforeEach, describe, expect, it, vi } from "vitest";
import { prepareDonationInvoicePosting } from "./invoice-posting";

vi.mock("@/lib/workspace/module-guard", () => ({
  requireWorkspaceModule: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/db", () => ({ db: {} }));

const invoice = {
  id: "invoice",
  invoiceNumber: "INV-100",
  projectId: "a",
  recipientName: "Partner",
  currency: "USD",
  status: "sent",
  amount: "100.00",
  sponsorshipId: "sponsor",
  mouPaymentId: null,
  sharedMouGroupId: null,
  lineItems: [
    { projectId: "a", quantity: 3, unitPrice: "20.00" },
    { projectId: "b", quantity: 2, unitPrice: "20.00" },
  ],
};
const sponsor = { id: "sponsor", status: "invoiced", deductionBps: 1000 };
const titles = [
  { id: "a", title: "Book A" },
  { id: "b", title: "Book B" },
];
const allocations = [
  { projectId: "a", amount: 60, invoiceId: "invoice", actualNetAmount: 54 },
  { projectId: "b", amount: 40, invoiceId: "invoice", actualNetAmount: 36 },
];
let selections: unknown[][];
function query(rows: unknown[]) {
  const result = {
    from: () => result,
    where: () => result,
    innerJoin: () => result,
    orderBy: () => result,
    for: () => result,
    limit: () => result,
    then: (resolve: (value: unknown[]) => unknown) =>
      Promise.resolve(rows).then(resolve),
  };
  return result;
}
const tx = { select: vi.fn(() => query(selections.shift() ?? [])) };
type Tx = Parameters<typeof prepareDonationInvoicePosting>[0];
beforeEach(() => {
  selections = [];
  vi.clearAllMocks();
});
const prepare = (
  rows = allocations,
  old: Parameters<typeof prepareDonationInvoicePosting>[3] = [],
  currency = "USD"
) => prepareDonationInvoicePosting(tx as unknown as Tx, currency, rows, old);
const happy = () => {
  selections = [[invoice], [sponsor], [invoice], [], [], [], titles, []];
};

describe("invoice posting validation", () => {
  it("validates the two-book sponsorship before any writes", async () => {
    happy();
    const result = await prepare();
    expect(result).not.toHaveProperty("error");
    expect(
      result.candidates?.[0].allocations.map((row) => row.amountCents)
    ).toEqual([6000, 4000]);
  });
  it("allows a reviewed partial sponsorship payment with the invoice split", async () => {
    happy();
    expect(
      await prepare([
        { ...allocations[0], amount: 12, actualNetAmount: 10.8 },
        { ...allocations[1], amount: 8, actualNetAmount: 7.2 },
      ])
    ).not.toHaveProperty("error");
  });
  it("rejects changed balances, different currencies, and changed splits", async () => {
    happy();
    expect(await prepare(allocations, [], "EUR")).toHaveProperty("error");
    happy();
    expect(
      await prepare([{ ...allocations[0], amount: 61 }, allocations[1]])
    ).toHaveProperty("error");
    happy();
    expect(
      await prepare([
        { ...allocations[0], amount: 50 },
        { ...allocations[1], amount: 50 },
      ])
    ).toHaveProperty("error");
  });
  it("rejects a void or already received invoice from a stale review", async () => {
    for (const status of ["void", "received"]) {
      selections = [
        [invoice],
        [sponsor],
        [{ ...invoice, status }],
        [],
        [],
        [],
        titles,
        [],
      ];
      expect(await prepare()).toHaveProperty("error");
    }
  });
  it("rejects net funding above the gross share", async () => {
    happy();
    expect(
      await prepare([
        { ...allocations[0], actualNetAmount: 61 },
        allocations[1],
      ])
    ).toHaveProperty("error");
  });
  it("rejects removing imported funds that are already used", async () => {
    selections.push(
      [invoice],
      [sponsor],
      [{ ...invoice, status: "received" }],
      [{ id: "receipt", sponsorshipId: "sponsor" }],
      [
        {
          receiptId: "receipt",
          invoiceId: "invoice",
          sponsorshipId: "sponsor",
          projectId: "a",
          amount: "60.00",
          net: "54.00",
        },
      ],
      [{ sponsorshipId: "sponsor", projectId: "a", amount: "20.00" }]
    );
    const result = await prepare(
      [],
      [{ invoiceId: "invoice", sponsorshipReceiptId: "receipt" }]
    );
    expect(result.error).toContain("funds were used");
  });
});
