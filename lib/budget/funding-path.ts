/**
 * Pure funding-path logic (no DB, no framework): how a sent proposal turns into
 * promised and received money. A partner's answer is one of an MoU, an
 * agreement without an MoU, a donation, or a decline. Safe for client use.
 */

export type ProposalFundingPath = "mou" | "no_mou" | "donation";
export type ExpectedPaymentBasis = "mou" | "no_mou";

export type ProposalAnswer =
  | "waiting"
  /** Accepted before the funding path was recorded. */
  | "accepted"
  | ProposalFundingPath
  | "declined";

export const FUNDING_PATHS: readonly ProposalFundingPath[] = [
  "mou",
  "no_mou",
  "donation",
];

export const PROPOSAL_ANSWER_LABELS: Record<ProposalAnswer, string> = {
  waiting: "Waiting for answer",
  accepted: "Accepted",
  mou: "MoU",
  no_mou: "Agreed, no MoU",
  donation: "Donation",
  declined: "Declined",
};

export function proposalAnswer(proposal: {
  status: string;
  fundingPath?: string | null;
}): ProposalAnswer {
  if (proposal.status === "declined") return "declined";
  if (proposal.status !== "accepted") return "waiting";
  return FUNDING_PATHS.includes(proposal.fundingPath as ProposalFundingPath)
    ? (proposal.fundingPath as ProposalFundingPath)
    : "accepted";
}

export const EXPECTED_PAYMENT_BASIS_LABELS: Record<ExpectedPaymentBasis, string> = {
  mou: "MoU",
  no_mou: "No MoU",
};

/** The first payment is due "on signing" only when there is an MoU to sign. */
export function expectedPaymentTriggerLabel(
  trigger: string,
  basis?: string | null
): string {
  if (trigger === "on_signing") {
    return basis === "no_mou" ? "On agreement" : "On signing";
  }
  if (trigger === "on_completion") return "On completion";
  if (trigger === "on_52_episodes") return "Episode milestone";
  return "Custom date";
}

/** The payment basis that matches an answered proposal, if it has one. */
export function basisForFundingPath(
  path: string | null | undefined
): ExpectedPaymentBasis | null {
  return path === "mou" || path === "no_mou" ? path : null;
}

function cents(value: string | number | null | undefined): number {
  return Math.round(Number(value ?? 0) * 100) || 0;
}

export type FundingPathProposal = {
  id: string;
  status: string;
  fundingPath?: string | null;
  agreedAmount?: string | null;
  totalAmount: string;
  sentAt: string | Date;
};

export type FundingPathPayment = {
  id: string;
  proposalId?: string | null;
  amount: string;
  paidAt?: string | Date | null;
  receiptId?: string | null;
};

export type FundingPathReceipt = {
  id: string;
  proposalId?: string | null;
  amount: string;
};

export type FundingNextStep =
  /** No answer yet. */
  | "record_answer"
  /** Partner agreed to a set amount but nothing is scheduled. */
  | "add_payments"
  /** Expected payments exist and some are not received. */
  | "open_payments"
  /** A donation is promised and has not fully arrived. */
  | "wait_donation"
  | "done"
  | "none";

export type FundingPathRow = {
  proposalId: string;
  answer: ProposalAnswer;
  askedCents: number;
  /** Null when nothing is promised, or a donation amount is not fixed. */
  promisedCents: number | null;
  receivedCents: number;
  expectedPaymentCount: number;
  unpaidPaymentCount: number;
  waitingDays: number;
  nextStep: FundingNextStep;
};

function daysSince(value: string | Date, today: Date): number {
  const sent = new Date(value).getTime();
  if (!Number.isFinite(sent)) return 0;
  return Math.max(0, Math.floor((today.getTime() - sent) / 86_400_000));
}

/** One row per sent proposal: asked, answer, promised, received, next step. */
export function buildFundingPath(input: {
  proposals: FundingPathProposal[];
  payments: FundingPathPayment[];
  receipts: FundingPathReceipt[];
  today?: Date;
}): FundingPathRow[] {
  const today = input.today ?? new Date();
  const receiptById = new Map(input.receipts.map((receipt) => [receipt.id, receipt]));
  return input.proposals.map((proposal) => {
    const answer = proposalAnswer(proposal);
    const linkedPayments = input.payments.filter(
      (payment) => payment.proposalId === proposal.id
    );
    const scheduledCents = linkedPayments.reduce(
      (sum, payment) => sum + cents(payment.amount),
      0
    );
    // A receipt counts once, whether it is linked directly or through a payment.
    const counted = new Set<string>();
    let receivedCents = 0;
    for (const payment of linkedPayments) {
      if (!payment.paidAt) continue;
      const receipt = payment.receiptId ? receiptById.get(payment.receiptId) : null;
      if (receipt) counted.add(receipt.id);
      receivedCents += cents(receipt?.amount ?? payment.amount);
    }
    for (const receipt of input.receipts) {
      if (receipt.proposalId !== proposal.id || counted.has(receipt.id)) continue;
      counted.add(receipt.id);
      receivedCents += cents(receipt.amount);
    }
    const agreedCents =
      proposal.agreedAmount == null ? null : cents(proposal.agreedAmount);
    const unpaidPaymentCount = linkedPayments.filter(
      (payment) => !payment.paidAt
    ).length;

    let promisedCents: number | null = null;
    let nextStep: FundingNextStep = "none";
    if (answer === "waiting" || answer === "accepted") {
      nextStep = "record_answer";
    } else if (answer === "mou" || answer === "no_mou") {
      promisedCents = linkedPayments.length > 0 ? scheduledCents : agreedCents;
      nextStep =
        linkedPayments.length === 0
          ? "add_payments"
          : unpaidPaymentCount > 0
            ? "open_payments"
            : "done";
    } else if (answer === "donation") {
      promisedCents = agreedCents;
      nextStep =
        agreedCents == null
          ? receivedCents > 0
            ? "done"
            : "wait_donation"
          : receivedCents >= agreedCents
            ? "done"
            : "wait_donation";
    }

    return {
      proposalId: proposal.id,
      answer,
      askedCents: cents(proposal.totalAmount),
      promisedCents,
      receivedCents,
      expectedPaymentCount: linkedPayments.length,
      unpaidPaymentCount,
      waitingDays: daysSince(proposal.sentAt, today),
      nextStep,
    };
  });
}

/**
 * Donation promises not yet received, in cents. Expected payments already count
 * as committed funding; a promised donation has no payment row, so its
 * outstanding part is added separately. Money linked to the proposal reduces
 * the promise because that money is counted as received funding.
 */
export function openDonationPromiseCents(input: {
  proposals: FundingPathProposal[];
  payments: FundingPathPayment[];
  receipts: FundingPathReceipt[];
}): number {
  const scheduledReceiptIds = new Set(
    input.payments
      .map((payment) => payment.receiptId)
      .filter((id): id is string => Boolean(id))
  );
  return input.proposals.reduce((sum, proposal) => {
    if (proposalAnswer(proposal) !== "donation" || proposal.agreedAmount == null) {
      return sum;
    }
    const received = input.receipts.reduce(
      (total, receipt) =>
        receipt.proposalId === proposal.id && !scheduledReceiptIds.has(receipt.id)
          ? total + cents(receipt.amount)
          : total,
      0
    );
    return sum + Math.max(0, cents(proposal.agreedAmount) - received);
  }, 0);
}

/** Counts that drive the Budget attention summary. */
export function fundingPathAttention(rows: FundingPathRow[]): {
  waitingCount: number;
  oldestWaitingDays: number;
  agreedWithoutPaymentsCount: number;
} {
  const waiting = rows.filter((row) => row.nextStep === "record_answer");
  return {
    waitingCount: waiting.length,
    oldestWaitingDays: waiting.reduce(
      (max, row) => Math.max(max, row.waitingDays),
      0
    ),
    agreedWithoutPaymentsCount: rows.filter(
      (row) => row.nextStep === "add_payments"
    ).length,
  };
}

/** Split an agreed amount into expected payment amounts; odd cents go last. */
export function splitAgreedAmount(
  totalCents: number,
  count: 1 | 2
): number[] {
  if (count === 1) return [totalCents];
  const first = Math.floor(totalCents / 2);
  return [first, totalCents - first];
}
