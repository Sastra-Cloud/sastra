import { formatBudgetMoney } from "@/lib/budget/attention";
import {
  finalizeSteps,
  plural,
  type GuideStepDraft,
  type GuideSteps,
} from "@/lib/guidance/steps";

export type BudgetStepsInput = {
  currency: string;
  /** Books are normally printed; other kinds treat printing as optional. */
  printing: "expected" | "optional" | "none";
  wordCount: number;
  sourcePageCount: number;
  items: ReadonlyArray<{
    category: string;
    unit: string;
    amount: string | number;
    isAutoQuantity: boolean;
  }>;
  hasPartnerQuote: boolean;
  /** What the partner is asked for. */
  partnerQuoteCents: number;
  /**
   * Expected net from the partner quote minus the costs. Null when it cannot
   * be compared simply (for example several print quantity options).
   */
  coverageCents: number | null;
  approval: {
    required: boolean;
    status: "pending" | "approved" | "changes_requested" | "superseded" | null;
    canSend: boolean;
  };
  /** Partner quotations saved but not sent yet. */
  unsentQuotationCount: number;
  sentProposalCount: number;
  waitingCount: number;
  oldestWaitingDays: number;
  agreedWithoutPaymentsCount: number;
  /** Expected payments or received money already exist for this scope. */
  hasFunding: boolean;
  /** Link to the Print tab, used while a printer's price is awaited. */
  printHref?: string;
};

function cents(value: string | number): number {
  return Math.round(Number(value) * 100) || 0;
}

/** The main-project budget path: size → costs → printing → quote → proposal → answer. */
export function buildBudgetSteps(input: BudgetStepsInput): GuideSteps {
  const money = (value: number) => formatBudgetMoney(value, input.currency);
  const steps: GuideStepDraft[] = [];
  // The printing cost is kept in step with the Print tab; it is not a cost the
  // person types, so it has its own step and never counts as a missing amount.
  const ownItems = input.items.filter((item) => item.category !== "print_ship");
  const hasItems = ownItems.length > 0;
  const costCents = ownItems.reduce((sum, item) => sum + cents(item.amount), 0);

  // Book size only matters when a cost is calculated from words or pages.
  const sizeDriven = input.items.some(
    (item) =>
      item.isAutoQuantity && (item.unit === "words" || item.unit === "pages")
  );
  const sizeKnown = input.wordCount > 0 || input.sourcePageCount > 0;
  // An empty budget starts with guided setup, which asks for the size itself.
  if (hasItems && (sizeDriven || sizeKnown)) {
    const parts = [
      input.wordCount > 0 ? plural(input.wordCount, "word") : null,
      input.sourcePageCount > 0
        ? plural(input.sourcePageCount, "source page")
        : null,
    ].filter(Boolean);
    steps.push({
      key: "book-size",
      label: "Book size",
      done: sizeKnown,
      fact: sizeKnown
        ? parts.join(" · ")
        : "Word and page costs cannot be calculated until you enter the book size.",
      action: sizeKnown
        ? { label: "Change", href: "#quotation-settings" }
        : { label: "Enter book size", href: "#quotation-settings" },
    });
  }

  const zeroCount = ownItems.filter((item) => cents(item.amount) === 0).length;
  steps.push({
    key: "costs",
    label: "Costs",
    done: hasItems && zeroCount === 0,
    fact: !hasItems
      ? input.items.length > 0
        ? "Only the printing cost is here. Guided setup adds the other costs."
        : "No costs yet. Guided setup asks for the book size and the costs. It takes about two minutes."
      : zeroCount > 0
        ? `${plural(zeroCount, "cost")} ${zeroCount === 1 ? "has" : "have"} no amount yet. Enter an amount or remove ${zeroCount === 1 ? "it" : "them"}.`
        : `${plural(ownItems.length, "cost")} · ${money(costCents)}`,
    action: !hasItems
      ? { label: "Start guided setup", href: "#budget-setup" }
      : { label: zeroCount > 0 ? "Review costs" : "Change", href: "#budget-costs" },
  });

  if (input.printing !== "none") {
    const printLines = input.items.filter((item) => item.category === "print_ship");
    const printCents = printLines.reduce((sum, item) => sum + cents(item.amount), 0);
    const awaitingPrice = printCents === 0 && printLines.length > 0;
    steps.push({
      key: "printing",
      label: "Printing cost",
      optional: input.printing === "optional",
      done: printCents > 0,
      fact:
        printCents > 0
          ? `Print and shipping: ${money(printCents)}`
          : awaitingPrice
            ? "Waiting for a printer’s price. It appears here when you review it on the Print tab."
            : input.printing === "optional"
            ? "Optional. Ask a printer for an estimate if this will be printed."
            : "No printing cost yet. Ask a printer for an estimate.",
      action:
        printCents > 0
          ? { label: "Change", href: "#print-budget-estimate" }
          : awaitingPrice && input.printHref
            ? { label: "Open Print", href: input.printHref }
            : { label: "Ask for an estimate", href: "#print-budget-estimate" },
    });
  }

  const short = input.coverageCents != null && input.coverageCents < 0;
  steps.push({
    key: "partner-quote",
    label: "Partner quote",
    done: hasItems && input.hasPartnerQuote && !short,
    fact: !hasItems
      ? "The price the funding partner sees. Add the costs first."
      : !input.hasPartnerQuote
        ? "Not set up yet. The partner quote is the price the funding partner sees."
        : short
          ? `The partner quote is ${money(-input.coverageCents!)} less than the costs need.`
          : `The partner is asked for ${money(input.partnerQuoteCents)}.`,
    action: hasItems
      ? {
          label:
            input.hasPartnerQuote && !short ? "Change" : "Check the partner quote",
          href: "#partner-quote",
        }
      : undefined,
  });

  const sent = input.sentProposalCount > 0;
  const approvalBlocks =
    input.approval.required && !input.approval.canSend;
  steps.push({
    key: "proposal",
    label: "Proposal",
    done: sent || input.hasFunding,
    fact: sent
      ? `${plural(input.sentProposalCount, "proposal")} sent.`
      : input.hasFunding
        ? "Funding is already recorded for this project."
        : !hasItems
          ? "Ask a partner to fund the project. Add the costs first."
          : approvalBlocks
            ? input.approval.status === "pending"
              ? "Waiting for your team to approve the budget."
              : input.approval.status === "changes_requested"
                ? "Your team asked for changes before this can be sent."
                : "Your team must approve the budget before you send a proposal."
            : input.unsentQuotationCount > 0
              ? `${plural(input.unsentQuotationCount, "partner quotation")} ${input.unsentQuotationCount === 1 ? "is" : "are"} ready. Write the email to send ${input.unsentQuotationCount === 1 ? "it" : "them"}.`
              : "No proposal yet.",
    action: !hasItems
      ? undefined
      : sent || input.hasFunding
        ? { label: "Start another proposal", href: "#proposal-setup" }
        : approvalBlocks
          ? { label: "Open approvals", href: "#decisions" }
          : input.unsentQuotationCount > 0
            ? { label: "Open the proposal", href: "#proposal-setup" }
            : { label: "Start a proposal", href: "#proposal-setup" },
  });

  const answersOpen =
    input.waitingCount > 0 || input.agreedWithoutPaymentsCount > 0;
  steps.push({
    key: "answer",
    label: "Answer and money",
    done: (sent || input.hasFunding) && !answersOpen,
    fact: !sent
      ? input.hasFunding
        ? "Expected payments and received money are in Payments and Cash flow."
        : "After you send a proposal, record what the partner decides."
      : input.agreedWithoutPaymentsCount > 0
        ? `${plural(input.agreedWithoutPaymentsCount, "partner")} agreed. Add the expected payments.`
        : input.waitingCount > 0
          ? `${plural(input.waitingCount, "proposal")} ${input.waitingCount === 1 ? "is" : "are"} waiting for an answer${input.oldestWaitingDays > 0 ? ` (${plural(input.oldestWaitingDays, "day")})` : ""}.`
          : "Every proposal has an answer.",
    action: sent
      ? {
          label: answersOpen ? "Record answer" : "Open",
          href: "#funding-path",
        }
      : undefined,
  });

  return finalizeSteps(steps);
}
