import type {
  DonationAllocationDraft,
  DonationMouPaymentOption,
} from "./types";

/** Add a reviewable MoU link only when project, amount, and currency are unique. */
export function applyUniqueExactMouMatch(
  allocation: DonationAllocationDraft,
  currency: string,
  payments: DonationMouPaymentOption[]
): DonationAllocationDraft {
  if (
    allocation.mouPaymentId ||
    allocation.sharedMouGroupId ||
    !allocation.projectId ||
    !allocation.amount
  ) {
    return allocation;
  }
  const amountCents = Math.round(Number(allocation.amount) * 100);
  if (!Number.isFinite(amountCents) || amountCents === 0) return allocation;
  const exact = payments.filter(
    (payment) =>
      payment.projectId === allocation.projectId &&
      payment.currency === currency &&
      Math.round(Number(payment.amount) * 100) === amountCents
  );
  if (exact.length !== 1) return allocation;
  return {
    ...allocation,
    mouPaymentId: exact[0].id,
    evidence: [`Amount matches ${exact[0].label}.`],
  };
}
