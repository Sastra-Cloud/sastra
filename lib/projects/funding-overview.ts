import { toCents } from "@/lib/budget/reconcile-math";

export type FundingOverviewInput = {
  currency: string;
  partnerName?: string | null;
  costs: Array<{ amount: string; amountSecured: string; amountSpent: string; currency: string }>;
  payments: Array<{ id: string; amount: string; currency: string; receiptId: string | null; paidAt: Date | null; dueDate: string | null; publicDescription: string | null; trigger: string }>;
  receipts: Array<{ id: string; amount: string; currency: string; expectedNetAmount: string | null; actualNetAmount: string | null; source: string | null; receivedDate: string | null }>;
  agreements: Array<{ id: string; name: string; allocationAmount: string; currency: string; counterparty?: string | null; reviewRequired?: boolean }>;
  allocations: Array<{ receiptId: string; groupId: string }>;
  donationReceiptIds: string[];
};
export type ProjectFundingOverview = ReturnType<typeof buildProjectFundingOverview>;

/** A promise is never cash. Keep currencies separate and count each receipt once. */
export function buildProjectFundingOverview(input: FundingOverviewInput) {
  const currencies = new Set([...input.costs.map(row => row.currency), ...input.payments.map(row => row.currency), ...input.receipts.map(row => row.currency), ...input.agreements.map(row => row.currency)]);
  if (!currencies.size) currencies.add(input.currency);
  const byReceipt = new Map(input.receipts.map(receipt => [receipt.id, receipt]));
  const allocationGroup = new Map(input.allocations.map(row => [row.receiptId, row.groupId]));
  const donationIds = new Set(input.donationReceiptIds);
  const sources = [
    ...input.agreements.map(agreement => {
      const receivedCents = input.receipts.filter(receipt => receipt.currency === agreement.currency && allocationGroup.get(receipt.id) === agreement.id).reduce((sum, receipt) => sum + toCents(receipt.amount), 0);
      return { id: agreement.id, type: "agreement" as const, name: [agreement.name, agreement.counterparty].filter(Boolean).join(" — "), reviewRequired: agreement.reviewRequired ?? false, receiptMissing: false, currency: agreement.currency,
        promisedCents: toCents(agreement.allocationAmount), receivedCents,
        outstandingCents: Math.max(0, toCents(agreement.allocationAmount) - receivedCents), dueDate: null as string | null };
    }),
    ...input.payments.map(payment => {
      const receipt = payment.receiptId ? byReceipt.get(payment.receiptId) : undefined;
      const receivedCents = receipt?.currency === payment.currency ? toCents(receipt.amount) : 0;
      const label = { on_signing: "On signing", on_completion: "On completion", on_52_episodes: "Episode milestone" }[payment.trigger] || "Scheduled funding";
      return { id: payment.id, type: "payment" as const, name: [input.partnerName, payment.publicDescription?.trim() || label].filter(Boolean).join(" — "), currency: payment.currency, reviewRequired: false, receiptMissing: !!payment.paidAt && (!receipt || receipt.currency !== payment.currency),
        promisedCents: toCents(payment.amount), receivedCents,
        outstandingCents: payment.paidAt ? 0 : Math.max(0, toCents(payment.amount) - receivedCents), dueDate: payment.dueDate };
    }),
  ];
  const balances = [...currencies].map(currency => {
    const costs = input.costs.filter(row => row.currency === currency);
    const receipts = input.receipts.filter(row => row.currency === currency);
    const promises = sources.filter(row => row.currency === currency);
    const neededCents = costs.reduce((sum, row) => sum + toCents(row.amount), 0);
    const spentCents = costs.reduce((sum, row) => sum + toCents(row.amountSpent), 0);
    const receivedCents = receipts.reduce((sum, row) => sum + toCents(row.amount), 0);
    const netReceivedCents = receipts.reduce((sum, row) => sum + toCents(row.actualNetAmount ?? row.expectedNetAmount ?? row.amount), 0);
    const scheduledCents = promises.reduce((sum, row) => sum + row.promisedCents, 0);
    const assignedCents = costs.reduce((sum, row) => sum + toCents(row.amountSecured), 0);
    return { currency, neededCents, spentCents, receivedCents, netReceivedCents, availableCents: netReceivedCents - spentCents,
      outstandingCents: promises.reduce((sum, row) => sum + row.outstandingCents, 0),
      unlinkedAssignedCents: Math.max(0, assignedCents - scheduledCents) };
  });
  return { balances, sources, receipts: input.receipts.map(receipt => ({ ...receipt, donation: donationIds.has(receipt.id),
    netCents: toCents(receipt.actualNetAmount ?? receipt.expectedNetAmount ?? receipt.amount) })) };
}
