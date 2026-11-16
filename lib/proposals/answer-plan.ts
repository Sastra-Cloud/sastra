import { z } from "zod";

import {
  basisForFundingPath,
  splitAgreedAmount,
  type ExpectedPaymentBasis,
  type ProposalFundingPath,
} from "@/lib/budget/funding-path";

/** What a manager records after a partner replies to a proposal. */
export const proposalAnswerInput = z.object({
  proposalId: z.string().uuid(),
  answer: z.enum(["waiting", "mou", "no_mou", "donation", "declined"]),
  agreedAmount: z.coerce.number().min(0).finite().nullable().optional(),
  answeredOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  note: z.string().trim().max(500).optional(),
  /** Expected payments to add with an MoU or no-MoU answer. */
  schedule: z.enum(["two", "one", "later"]).default("later"),
  /** Money already on the project that belongs to this proposal. */
  receiptIds: z.array(z.string().uuid()).max(50).optional(),
});

export type ProposalAnswerInput = z.input<typeof proposalAnswerInput>;
export type ProposalAnswerValue = z.infer<typeof proposalAnswerInput>;

export type PlannedExpectedPayment = {
  amount: string;
  trigger: "on_signing" | "on_completion";
  notes: string;
  publicDescription: string;
};

export type ProposalAnswerPlan = {
  patch: {
    status: "sent" | "accepted" | "declined";
    fundingPath: ProposalFundingPath | null;
    agreedAmount: string | null;
    answeredOn: string | null;
    answerNote: string | null;
  };
  basis: ExpectedPaymentBasis | null;
  payments: PlannedExpectedPayment[];
};

/**
 * Turn a recorded answer into the proposal update and any expected payments.
 * Payments are planned only when the proposal has none yet, so recording the
 * same answer twice never doubles the promised money.
 */
export function planProposalAnswer(args: {
  input: ProposalAnswerValue;
  proposal: { currency: string };
  budgetCurrency: string;
  linkedPaymentCount: number;
  today: string;
}): { error: string } | ProposalAnswerPlan {
  const { input } = args;
  const note = input.note?.trim() || null;

  if (input.answer === "waiting") {
    return {
      patch: {
        status: "sent",
        fundingPath: null,
        agreedAmount: null,
        answeredOn: null,
        answerNote: note,
      },
      basis: null,
      payments: [],
    };
  }

  const answeredOn = input.answeredOn ?? args.today;
  if (input.answer === "declined") {
    return {
      patch: {
        status: "declined",
        fundingPath: null,
        agreedAmount: null,
        answeredOn,
        answerNote: note,
      },
      basis: null,
      payments: [],
    };
  }

  const amount = input.agreedAmount ?? null;
  if (input.answer === "donation") {
    return {
      patch: {
        status: "accepted",
        fundingPath: "donation",
        // A donation of unknown size is still an answer; zero means "not fixed".
        agreedAmount: amount && amount > 0 ? amount.toFixed(2) : null,
        answeredOn,
        answerNote: note,
      },
      basis: null,
      payments: [],
    };
  }

  if (!amount || amount <= 0) {
    return { error: "Enter the amount the partner agreed to." };
  }
  const basis = basisForFundingPath(input.answer);
  const plan: ProposalAnswerPlan = {
    patch: {
      status: "accepted",
      fundingPath: input.answer,
      agreedAmount: amount.toFixed(2),
      answeredOn,
      answerNote: note,
    },
    basis,
    payments: [],
  };
  if (input.schedule === "later" || args.linkedPaymentCount > 0) return plan;
  if (args.proposal.currency !== args.budgetCurrency) {
    return {
      error:
        "The budget currency changed after this proposal was sent. Choose “Add later”, then add expected payments in Payments.",
    };
  }

  const totalCents = Math.round(amount * 100);
  if (input.schedule === "two" && totalCents < 2) {
    return { error: "Enter at least 0.02 to split into two payments." };
  }
  const first = input.answer === "mou" ? "MoU signing" : "partner agreement";
  const amounts = splitAgreedAmount(totalCents, input.schedule === "two" ? 2 : 1);
  plan.payments = amounts.map((cents, index) => {
    const isFinal = amounts.length === 2 && index === 1;
    return {
      amount: (cents / 100).toFixed(2),
      trigger: isFinal ? "on_completion" : "on_signing",
      notes:
        amounts.length === 1
          ? `Funding payment on ${first}`
          : isFinal
            ? "Final funding payment on project completion"
            : `First of two funding payments on ${first}`,
      publicDescription:
        amounts.length === 1
          ? "Project funding"
          : isFinal
            ? "Final project funding installment"
            : "Initial project funding installment",
    };
  });
  return plan;
}
