import { chooseEstimateQuote } from "./estimate";
import { getPrintQuoteTotal } from "./quote-economics";

export const BUDGET_ESTIMATE_KIND = "budget_estimate";
export const MAX_REFERENCE_PDF_BYTES = 15 * 1024 * 1024;

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

/** Suggestions never change money. A reviewed production quote supersedes the
 * selected planning estimate; reprints never replace the main book budget. */
export function chooseBudgetPrintQuote<T extends Quote>(
  runs: Run[],
  quotes: T[],
): T | null {
  const first = runs.find(
    (run) => run.kind === "first_print" && run.status !== "cancelled",
  );
  if (first) {
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
    if (chosen) return quotes.find((q) => q.id === chosen.id) ?? null;
  }
  const estimates = new Set(
    runs
      .filter(
        (r) => r.kind === BUDGET_ESTIMATE_KIND && r.status !== "cancelled",
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
