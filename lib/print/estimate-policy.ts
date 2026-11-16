import { chooseEstimateQuote } from "./estimate";
import { getPrintQuoteTotal } from "./quote-economics";

export const BUDGET_ESTIMATE_KIND = "budget_estimate";
export const MAX_REFERENCE_PDF_BYTES = 15 * 1024 * 1024;
/** Run kinds whose quotes can be chosen as the main book's budget estimate. */
export const BUDGET_ESTIMATE_SOURCE_RUN_KINDS = [
  BUDGET_ESTIMATE_KIND,
  "first_print",
];

type Run = {
  id: string;
  kind: string;
  status: string;
  quantityTarget: number | null;
};
type Quote = {
  id: string;
  runId: string;
  kind: string;
  reviewStatus: string;
  quantityCps: number | null;
  unitPrice: string | number | null;
  totalAmount: string | number | null;
};

/**
 * A quote forwarded by email lands on the first print run, so a manager can pick
 * it for planning without a separate estimate request. Accepted quotes already
 * set the budget and own payments; selecting one would silently undo that order.
 */
export function canUseAsBudgetEstimate(
  run: Pick<Run, "kind" | "status">,
  quote: Pick<Quote, "kind" | "reviewStatus">,
): boolean {
  if (run.status === "cancelled") return false;
  if (run.kind === BUDGET_ESTIMATE_KIND) return true;
  return (
    run.kind === "first_print" &&
    quote.kind === "quote" &&
    ["suggested", "active", "estimated"].includes(quote.reviewStatus)
  );
}

/** The reviewed first-print price, which outranks any planning estimate. */
export function reviewedFirstPrintQuote<T extends Quote>(
  runs: Run[],
  quotes: T[],
): T | null {
  const first = runs.find(
    (run) => run.kind === "first_print" && run.status !== "cancelled",
  );
  if (!first) return null;
  const reviewed = quotes.filter(
    (q) =>
      q.runId === first.id &&
      ["accepted", "active"].includes(q.reviewStatus) &&
      getPrintQuoteTotal(q),
  );
  const chosen = chooseEstimateQuote(
    reviewed.map((q) => ({
      ...q,
      totalAmount: getPrintQuoteTotal(q)!.totalCost,
    })),
    first.quantityTarget,
  );
  return chosen ? (quotes.find((q) => q.id === chosen.id) ?? null) : null;
}

/** Suggestions never change money. A reviewed production quote supersedes the
 * selected planning estimate; reprints never replace the main book budget. */
export function chooseBudgetPrintQuote<T extends Quote>(
  runs: Run[],
  quotes: T[],
): T | null {
  const reviewed = reviewedFirstPrintQuote(runs, quotes);
  if (reviewed) return reviewed;
  const estimates = new Set(
    runs
      .filter(
        (r) =>
          BUDGET_ESTIMATE_SOURCE_RUN_KINDS.includes(r.kind) &&
          r.status !== "cancelled",
      )
      .map((r) => r.id),
  );
  return (
    quotes.find(
      (q) =>
        estimates.has(q.runId) &&
        q.reviewStatus === "estimated" &&
        getPrintQuoteTotal(q),
    ) ?? null
  );
}
