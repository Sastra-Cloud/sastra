import { expect, it } from "vitest";

import { buildPrintSteps, type PrintStepsInput } from "./steps";

const base: PrintStepsInput = {
  run: null,
  requestSent: false,
  hasRequestDraft: false,
  quoteCount: 0,
  waitingQuoteIds: [],
  hasAcceptedQuote: false,
  paymentCount: 0,
  unpaidPaymentIds: [],
};
const run = { id: "run-1", hasPrinter: true, quantityCount: 3 };

it("starts with guided setup when there is no print run", () => {
  const guide = buildPrintSteps(base);
  expect(guide.next?.key).toBe("run");
  expect(guide.next?.action).toEqual({ label: "Start guided setup", id: "setup" });
  expect(guide.steps.filter((step) => step.action).map((step) => step.key)).toEqual(["run"]);
});

it("names what a print run made from a forwarded email is missing", () => {
  const guide = buildPrintSteps({
    ...base,
    run: { id: "run-1", hasPrinter: false, quantityCount: 3 },
    quoteCount: 2,
    waitingQuoteIds: ["q1", "q2"],
  });
  expect(guide.next?.key).toBe("run");
  expect(guide.next?.fact).toBe("This print run still needs a printer.");
  expect(guide.next?.action?.href).toBe("#print-run-run-1-specs");
  // Prices that already arrived still count as asked.
  expect(guide.steps.find((step) => step.key === "request")?.status).toBe("done");
});

it("offers the saved request draft before writing a new one", () => {
  expect(buildPrintSteps({ ...base, run }).next?.action).toEqual({
    label: "Write the request",
    id: "request",
  });
  expect(buildPrintSteps({ ...base, run, hasRequestDraft: true }).next?.action?.label).toBe(
    "Open the draft"
  );
});

it("points at the first price waiting for review", () => {
  const guide = buildPrintSteps({
    ...base,
    run,
    requestSent: true,
    quoteCount: 4,
    waitingQuoteIds: ["q7", "q8", "q9", "q10"],
  });
  expect(guide.next?.key).toBe("prices");
  expect(guide.next?.fact).toBe("4 prices are waiting for your review.");
  expect(guide.next?.action?.href).toBe("#print-quote-q7");
});

it("stops asking for review of other copy amounts once one price is accepted", () => {
  const guide = buildPrintSteps({
    ...base,
    run,
    requestSent: true,
    quoteCount: 5,
    waitingQuoteIds: ["q2", "q3", "q4", "q5"],
    hasAcceptedQuote: true,
    paymentCount: 2,
    unpaidPaymentIds: ["p2"],
  });
  expect(guide.next?.key).toBe("pay");
  expect(guide.next?.fact).toBe("1 payment is not paid yet.");
  expect(guide.next?.action?.href).toBe("#payment-p2");
  expect(buildPrintSteps({ ...base, run, requestSent: true, quoteCount: 1, hasAcceptedQuote: true, paymentCount: 2 }).allDone).toBe(true);
});
