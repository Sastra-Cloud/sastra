import { expectedPaymentTriggerLabel } from "@/lib/budget/funding-path";
import { toCents } from "@/lib/budget/reconcile-math";
import { isOutgoingPaymentTerms, suggestPercentagePayments } from "@/lib/budget/payment-percentage";

export type FundingOverviewInput = {
  currency: string;
  partnerName?: string | null;
  costs: Array<{ amount: string; amountSecured: string; amountSpent: string; currency: string }>;
  payments: Array<{ id: string; amount: string; currency: string; receiptId: string | null; paidAt: Date | null; dueDate: string | null; publicDescription: string | null; trigger: string; fundingBasis?: string | null; partnerName?: string | null; notes?: string | null }>;
  receipts: Array<{ id: string; amount: string; currency: string; expectedNetAmount: string | null; actualNetAmount: string | null; source: string | null; receivedDate: string | null; proposalId?: string | null }>;
  agreements: Array<{ id: string; name: string; allocationAmount: string; currency: string; counterparty?: string | null; reviewRequired?: boolean }>;
  allocations: Array<{ receiptId: string; groupId: string }>;
  donationReceiptIds: string[];
  /** Partners who answered a proposal with a donation of a known amount. */
  donationPromises?: Array<{ id: string; partnerName: string; agreedAmount: string; currency: string }>;
};
export type ProjectFundingOverview = ReturnType<typeof buildProjectFundingOverview>;

/** A promise is never cash. Keep currencies separate and count each receipt once. */
export function buildProjectFundingOverview(input: FundingOverviewInput) {
  const currencies = new Set([...input.costs.map(row => row.currency), ...input.payments.map(row => row.currency), ...input.receipts.map(row => row.currency), ...input.agreements.map(row => row.currency), ...(input.donationPromises ?? []).map(row => row.currency)]);
  if (!currencies.size) currencies.add(input.currency);
  const byReceipt = new Map(input.receipts.map(receipt => [receipt.id, receipt]));
  const allocationGroup = new Map(input.allocations.map(row => [row.receiptId, row.groupId]));
  const donationIds = new Set(input.donationReceiptIds);
  const paymentReceiptIds = new Set(input.payments.flatMap(payment => payment.receiptId ? [payment.receiptId] : []));
  const excludedPayments = input.payments.filter(payment => isOutgoingPaymentTerms(payment.notes));
  const payments = input.payments.filter(payment => !isOutgoingPaymentTerms(payment.notes));
  const calculations = suggestPercentagePayments(payments.map(payment => ({ ...payment, notes: payment.notes ?? null })));
  const sources = [
    ...input.agreements.map(agreement => {
      const receivedCents = input.receipts.filter(receipt => receipt.currency === agreement.currency && allocationGroup.get(receipt.id) === agreement.id).reduce((sum, receipt) => sum + toCents(receipt.amount), 0);
      return { id: agreement.id, type: "agreement" as const, name: [agreement.name, agreement.counterparty].filter(Boolean).join(" — "), reviewRequired: agreement.reviewRequired ?? false, receiptMissing: false, amountPending: false, calculation: null, notes: null, currency: agreement.currency,
        promisedCents: toCents(agreement.allocationAmount), receivedCents,
        outstandingCents: Math.max(0, toCents(agreement.allocationAmount) - receivedCents), dueDate: null as string | null };
    }),
    ...payments.map(payment => {
      const receipt = payment.receiptId ? byReceipt.get(payment.receiptId) : undefined;
      const receivedCents = receipt?.currency === payment.currency ? toCents(receipt.amount) : 0;
      const label = payment.trigger === "custom" ? "Expected payment" : expectedPaymentTriggerLabel(payment.trigger, payment.fundingBasis);
      const calculation = calculations.get(payment.id) ?? null;
      const amountPending = toCents(payment.amount) <= 0;
      const promisedCents = calculation?.amountCents ?? toCents(payment.amount);
      return { id: payment.id, type: "payment" as const, name: [payment.partnerName?.trim() || input.partnerName, payment.publicDescription?.trim() || label].filter(Boolean).join(" — "), currency: payment.currency, reviewRequired: amountPending, amountPending, calculation, notes: payment.notes ?? null, receiptMissing: !!payment.paidAt && (!receipt || receipt.currency !== payment.currency),
        promisedCents, receivedCents,
        outstandingCents: payment.paidAt ? 0 : Math.max(0, promisedCents - receivedCents), dueDate: payment.dueDate };
    }),
    // A promised donation has no payment row. Money linked to its proposal counts once, as received.
    ...(input.donationPromises ?? []).map(promise => {
      const receivedCents = input.receipts.filter(receipt => receipt.proposalId === promise.id && receipt.currency === promise.currency && !paymentReceiptIds.has(receipt.id)).reduce((sum, receipt) => sum + toCents(receipt.amount), 0);
      return { id: promise.id, type: "donation" as const, name: `${promise.partnerName} — Promised donation`, currency: promise.currency, reviewRequired: false, receiptMissing: false, amountPending: false, calculation: null, notes: null,
        promisedCents: toCents(promise.agreedAmount), receivedCents,
        outstandingCents: Math.max(0, toCents(promise.agreedAmount) - receivedCents), dueDate: null as string | null };
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
    const linkedReceiptIds = new Set([
      ...paymentReceiptIds, ...input.allocations.map(row => row.receiptId),
      ...receipts.filter(receipt => (input.donationPromises ?? []).some(promise => promise.id === receipt.proposalId && promise.currency === currency)).map(receipt => receipt.id),
    ]);
    const unlinkedReceivedCents = promises.length ? receipts.filter(receipt => !linkedReceiptIds.has(receipt.id)).reduce((sum, receipt) => sum + toCents(receipt.amount), 0) : 0;
    const amountPendingCount = promises.filter(source => source.amountPending).length;
    const excludedPaymentCount = excludedPayments.filter(payment => payment.currency === currency).length;
    const needsReview = promises.some(source => source.reviewRequired || source.receiptMissing) || unlinkedReceivedCents > 0 || excludedPaymentCount > 0;
    return { currency, neededCents, spentCents, receivedCents, netReceivedCents, availableCents: netReceivedCents - spentCents,
      promisedCents: scheduledCents, amountPendingCount, unlinkedReceivedCents, excludedPaymentCount, needsReview,
      outstandingCents: promises.reduce((sum, row) => sum + row.outstandingCents, 0),
      unlinkedAssignedCents: Math.max(0, assignedCents - scheduledCents) };
  });
  return { balances, sources, excludedPayments, receipts: input.receipts.map(receipt => ({ ...receipt, donation: donationIds.has(receipt.id),
    netCents: toCents(receipt.actualNetAmount ?? receipt.expectedNetAmount ?? receipt.amount) })) };
}
