import { expect, it } from "vitest";
import { buildProjectFundingOverview, type FundingOverviewInput } from "./funding-overview";

it("keeps promises out of available cash, counts linked donations once, and uses actual net less spend", () => {
  const input: FundingOverviewInput = {
    currency: "USD",
    costs: [{ amount: "1000", amountSecured: "700", amountSpent: "100", currency: "USD" }],
    payments: [
      { id: "signing", amount: "200", currency: "USD", receiptId: "paid", paidAt: new Date(), dueDate: null, publicDescription: null, trigger: "on_signing" },
      { id: "completion", amount: "300", currency: "USD", receiptId: null, paidAt: null, dueDate: null, publicDescription: null, trigger: "on_completion" },
    ],
    receipts: [
      { id: "paid", amount: "200", currency: "USD", expectedNetAmount: "180", actualNetAmount: "175", source: "Partner", receivedDate: null },
      { id: "gift", amount: "50", currency: "USD", expectedNetAmount: "45", actualNetAmount: null, source: "Donor", receivedDate: null },
      { id: "shared", amount: "50", currency: "USD", expectedNetAmount: null, actualNetAmount: "40", source: "Grant", receivedDate: null },
    ],
    agreements: [{ id: "grant", name: "Grant MoU", allocationAmount: "200", currency: "USD" }],
    allocations: [{ receiptId: "shared", groupId: "grant" }], donationReceiptIds: ["paid", "gift"],
  };
  const result = buildProjectFundingOverview(input);
  expect(result.balances).toEqual([{ currency: "USD", neededCents: 100000, spentCents: 10000, receivedCents: 30000,
    netReceivedCents: 26000, availableCents: 16000, outstandingCents: 45000, unlinkedAssignedCents: 0, promisedCents: 70000, amountPendingCount: 0, unlinkedReceivedCents: 5000, excludedPaymentCount: 0, needsReview: true }]);
  expect(result.sources.map(source => source.outstandingCents)).toEqual([15000, 0, 30000]);
  expect(result.receipts.filter(receipt => receipt.donation).map(receipt => receipt.id)).toEqual(["paid", "gift"]);
});

it("shows received funds without a quotation, separates currencies, and does not turn budget earmarks into spendable cash", () => {
  const result = buildProjectFundingOverview({ currency: "USD", payments: [], agreements: [], allocations: [], donationReceiptIds: [],
    receipts: [{ id: "euro", amount: "50", currency: "EUR", expectedNetAmount: "45", actualNetAmount: "0", source: null, receivedDate: null }],
    costs: [{ amount: "100", amountSecured: "80", amountSpent: "10", currency: "GBP" }],
  });
  expect(result.balances).toEqual([
    { currency: "GBP", neededCents: 10000, spentCents: 1000, receivedCents: 0, netReceivedCents: 0, availableCents: -1000, outstandingCents: 0, unlinkedAssignedCents: 8000, promisedCents: 0, amountPendingCount: 0, unlinkedReceivedCents: 0, excludedPaymentCount: 0, needsReview: false },
    { currency: "EUR", neededCents: 0, spentCents: 0, receivedCents: 5000, netReceivedCents: 0, availableCents: 0, outstandingCents: 0, unlinkedAssignedCents: 0, promisedCents: 0, amountPendingCount: 0, unlinkedReceivedCents: 0, excludedPaymentCount: 0, needsReview: false },
  ]);
});

it("keeps a promised donation outstanding only until its linked money arrives", () => {
  const result = buildProjectFundingOverview({ currency: "USD", costs: [], agreements: [], allocations: [], donationReceiptIds: ["gift"],
    payments: [],
    receipts: [{ id: "gift", amount: "400", currency: "USD", expectedNetAmount: null, actualNetAmount: null, source: "Partner", receivedDate: null, proposalId: "proposal" }],
    donationPromises: [{ id: "proposal", partnerName: "Partner", agreedAmount: "1000", currency: "USD" }],
  });
  expect(result.sources).toMatchObject([{ type: "donation", promisedCents: 100000, receivedCents: 40000, outstandingCents: 60000 }]);
  expect(result.balances[0]).toMatchObject({ receivedCents: 40000, outstandingCents: 60000 });
});

it("shows percentage commitments as unconfirmed, excludes an outgoing fee, and reconciles a received donation only after linking", () => {
  const base = {
    currency: "USD", agreements: [], allocations: [], donationReceiptIds: ["receipt"],
    costs: [{ amount: "21670.56", amountSecured: "0", amountSpent: "0", currency: "USD" }],
    receipts: [{ id: "receipt", amount: "10835.28", currency: "USD", actualNetAmount: null, expectedNetAmount: null, source: "Funding partner", receivedDate: "2025-07-11" }],
  };
  const payment = { currency: "USD", receiptId: null, paidAt: null, dueDate: null, publicDescription: null, trigger: "on_signing" };
  const payments = [
    { ...payment, id: "initial", amount: "0", notes: "50% of the Total Payment to Licensee (US$21,670.56) due on contract signature" },
    { ...payment, id: "fee", amount: "675", notes: "Administration Fee to the Licensor (Example Rights Holder), US$675.00" },
    { ...payment, id: "final", amount: "0", trigger: "on_completion", notes: "Remaining 50% of the Total Payment to Licensee" },
  ];
  const before = buildProjectFundingOverview({ ...base, payments });
  expect(before.sources.map(source => source.id)).toEqual(["initial", "final"]);
  expect(before.excludedPayments.map(source => source.id)).toEqual(["fee"]);
  expect(before.sources.every(source => source.reviewRequired && source.calculation?.amountCents === 1083528)).toBe(true);
  expect(before.balances[0]).toMatchObject({ promisedCents: 2167056, receivedCents: 1083528, availableCents: 1083528, unlinkedReceivedCents: 1083528, amountPendingCount: 2, needsReview: true });
  const reviewed = buildProjectFundingOverview({ ...base, payments: [
    { ...payments[0], amount: "10835.28", receiptId: "receipt", paidAt: new Date() },
    { ...payments[2], amount: "10835.28" },
  ] });
  expect(reviewed.balances[0]).toMatchObject({ promisedCents: 2167056, receivedCents: 1083528, availableCents: 1083528, outstandingCents: 1083528, unlinkedReceivedCents: 0, amountPendingCount: 0, needsReview: false });
});
