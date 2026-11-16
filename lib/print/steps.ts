import {
  finalizeSteps,
  plural,
  type GuideStepDraft,
  type GuideSteps,
} from "@/lib/guidance/steps";

export type PrintStepsInput = {
  /** The current print run, if any. */
  run: {
    id: string;
    hasPrinter: boolean;
    quantityCount: number;
  } | null;
  /** A price request reached the printer (an email thread is linked). */
  requestSent: boolean;
  hasRequestDraft: boolean;
  quoteCount: number;
  /** Prices read from an email or file that nobody has reviewed yet. */
  waitingQuoteIds: readonly string[];
  hasAcceptedQuote: boolean;
  paymentCount: number;
  unpaidPaymentIds: readonly string[];
};

/** The same five steps as "Printing in five steps" in the help page. */
export function buildPrintSteps(input: PrintStepsInput): GuideSteps {
  const { run } = input;
  const steps: GuideStepDraft[] = [];
  const missing = run
    ? [
        run.hasPrinter ? null : "a printer",
        run.quantityCount > 0 ? null : "copy amounts",
      ].filter(Boolean)
    : [];

  steps.push({
    key: "run",
    label: "Set up a print run",
    done: Boolean(run) && missing.length === 0,
    fact: !run
      ? "No print run yet. Guided setup fills in what Sastra already knows."
      : missing.length
        ? `This print run still needs ${missing.join(" and ")}.`
        : "The print run has a printer and copy amounts.",
    action: !run
      ? { label: "Start guided setup", id: "setup" }
      : {
          label: missing.length ? "Finish the print run" : "Change",
          href: `#print-run-${run.id}-specs`,
        },
  });

  const asked = input.requestSent || input.quoteCount > 0;
  steps.push({
    key: "request",
    label: "Ask printers for prices",
    done: asked,
    fact: asked
      ? input.requestSent
        ? "A price request was sent."
        : "Prices are already saved for this run."
      : !run
        ? "Sastra writes the email. You check it before it is sent."
        : input.hasRequestDraft
          ? "A request is saved as a draft. Check it and send it."
          : "No request sent yet. Sastra writes the email; you check it first.",
    action:
      run && !asked
        ? {
            label: input.hasRequestDraft ? "Open the draft" : "Write the request",
            id: "request",
          }
        : undefined,
  });

  const waiting = input.waitingQuoteIds.length;
  const checked =
    input.hasAcceptedQuote || (input.quoteCount > 0 && waiting === 0);
  steps.push({
    key: "prices",
    label: "Check the prices",
    done: checked,
    fact: checked
      ? `${plural(input.quoteCount, "price")} saved.`
      : waiting > 0
        ? `${plural(waiting, "price")} ${waiting === 1 ? "is" : "are"} waiting for your review.`
        : "No prices yet. Forward the printer’s reply to the project email, or add it to the run.",
    action: !run
      ? undefined
      : waiting > 0 && !checked
        ? { label: "Review prices", href: `#print-quote-${input.waitingQuoteIds[0]}` }
        : { label: checked ? "Open" : "Add a price", href: `#print-run-${run.id}-quotes` },
  });

  steps.push({
    key: "accept",
    label: "Accept one price",
    done: input.hasAcceptedQuote,
    fact: input.hasAcceptedQuote
      ? "One price is accepted. It is the print cost on the budget."
      : "Compare the copy amounts and accept one price. It becomes the print cost on the budget.",
    action:
      run && input.quoteCount > 0 && !input.hasAcceptedQuote
        ? { label: "Compare prices", href: `#print-run-${run.id}-quotes` }
        : undefined,
  });

  const unpaid = input.unpaidPaymentIds.length;
  steps.push({
    key: "pay",
    label: "Pay the printer",
    done: input.paymentCount > 0 && unpaid === 0,
    fact:
      input.paymentCount === 0
        ? "Payments are added when you accept a price."
        : unpaid > 0
          ? `${plural(unpaid, "payment")} ${unpaid === 1 ? "is" : "are"} not paid yet.`
          : "Every payment is paid.",
    action:
      unpaid > 0
        ? { label: "Open payments", href: `#payment-${input.unpaidPaymentIds[0]}` }
        : undefined,
  });

  return finalizeSteps(steps);
}
