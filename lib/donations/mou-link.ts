import { isOutgoingPaymentTerms } from "@/lib/budget/payment-percentage";

export type DonationMouLinkOption = {
  paymentId: string;
  amount: string;
  currency: string;
  label: string;
  /** The expected payment has no amount yet. Linking saves the amount received. */
  amountUnset?: boolean;
};

/** Manual links stay within one project, print scope, and currency. */
export function donationMouLinkOptions(
  receipt: { projectId: string; printRunId: string | null; currency: string },
  payments: Array<{
    id: string;
    projectId: string;
    printRunId: string | null;
    amount: string;
    currency: string;
    paidAt: Date | null;
    receiptId: string | null;
    sharedMouGroupId: string | null;
    trigger: string;
    dueDate: string | null;
    notes: string | null;
  }>
): DonationMouLinkOption[] {
  const labels: Record<string, string> = {
    on_signing: "On signing",
    on_completion: "On completion",
    on_52_episodes: "Episode milestone",
  };
  return payments
    .filter((payment) =>
      payment.projectId === receipt.projectId &&
      payment.printRunId === receipt.printRunId &&
      payment.currency === receipt.currency &&
      !payment.paidAt && !payment.receiptId && !payment.sharedMouGroupId &&
      // A payment with no amount yet can still be the one this money answers.
      Number(payment.amount) >= 0 && !isOutgoingPaymentTerms(payment.notes)
    )
    .map((payment) => ({
      paymentId: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      label: `${payment.notes?.trim() || labels[payment.trigger] || "Scheduled payment"}${payment.dueDate ? ` · due ${payment.dueDate}` : ""}`,
      ...(Number(payment.amount) === 0 ? { amountUnset: true } : {}),
    }));
}
