/**
 * Pre-screen policy for the inbound-email project signal review.
 *
 * `reviewPossibleNewProject` runs on every inbound message, so most of its work
 * is spent reading newsletters, receipts, and provider alerts that will never
 * produce a suggestion. A fast typed judgment answers "could this possibly
 * produce any of our three suggestion kinds?" first, and only clearly-negative
 * mail skips the full model call.
 *
 * Pure and dependency-free so the thresholds stay table-testable.
 */

/** Above this, the email might be about a new deliverable; don't skip. */
export const NEW_DELIVERABLE_SKIP_MAX = 0.3;

/** Above this, the email might carry a dated funding obligation; don't skip. */
export const FUNDING_OBLIGATION_SKIP_MAX = 0.3;

/** How sure we must be that no counterparty is involved before skipping. */
export const COUNTERPARTY_NONE_MIN_CONFIDENCE = 0.7;

export const COUNTERPARTY_NONE = "none_of_the_above";

export type ProjectSignalJudgment = {
  newDeliverable: { noul: number };
  fundingObligation: { noul: number };
  counterpartyType: { choice: string; confidence: number };
};

/**
 * Skip the model call only when all three suggestion kinds are clearly out.
 * Anything uncertain — and any missing judgment — reviews as before.
 */
export function shouldSkipProjectSignalReview(
  judgment: ProjectSignalJudgment | null | undefined
): boolean {
  if (!judgment) return false;
  const { newDeliverable, fundingObligation, counterpartyType } = judgment;
  if (!newDeliverable || !fundingObligation || !counterpartyType) return false;
  if (!Number.isFinite(newDeliverable.noul)) return false;
  if (!Number.isFinite(fundingObligation.noul)) return false;
  if (!Number.isFinite(counterpartyType.confidence)) return false;
  return (
    newDeliverable.noul < NEW_DELIVERABLE_SKIP_MAX &&
    fundingObligation.noul < FUNDING_OBLIGATION_SKIP_MAX &&
    counterpartyType.choice === COUNTERPARTY_NONE &&
    counterpartyType.confidence >= COUNTERPARTY_NONE_MIN_CONFIDENCE
  );
}
