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
    netReceivedCents: 26000, availableCents: 16000, outstandingCents: 45000, unlinkedAssignedCents: 0 }]);
  expect(result.sources.map(source => source.outstandingCents)).toEqual([15000, 0, 30000]);
  expect(result.receipts.filter(receipt => receipt.donation).map(receipt => receipt.id)).toEqual(["paid", "gift"]);
});

it("shows received funds without a quotation, separates currencies, and does not turn budget earmarks into spendable cash", () => {
  const result = buildProjectFundingOverview({ currency: "USD", payments: [], agreements: [], allocations: [], donationReceiptIds: [],
    receipts: [{ id: "euro", amount: "50", currency: "EUR", expectedNetAmount: "45", actualNetAmount: "0", source: null, receivedDate: null }],
    costs: [{ amount: "100", amountSecured: "80", amountSpent: "10", currency: "GBP" }],
  });
  expect(result.balances).toEqual([
    { currency: "GBP", neededCents: 10000, spentCents: 1000, receivedCents: 0, netReceivedCents: 0, availableCents: -1000, outstandingCents: 0, unlinkedAssignedCents: 8000 },
    { currency: "EUR", neededCents: 0, spentCents: 0, receivedCents: 5000, netReceivedCents: 0, availableCents: 0, outstandingCents: 0, unlinkedAssignedCents: 0 },
  ]);
});
