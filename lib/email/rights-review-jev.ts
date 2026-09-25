/**
 * Pre-screen policy for project-linked PDF rights review.
 *
 * Attachments reach this queue on a filename and subject heuristic, so print
 * invoices and marketing PDFs land here too — each costing a document-vision
 * call. A typed judgment reads the surrounding email, not the PDF, so it can
 * only rule out the clear misses; the threshold is deliberately far more
 * cautious than the other pre-screens because the document itself is unseen.
 *
 * Pure so the threshold stays table-testable.
 */

/** Below this probability the surrounding email rules the document out. */
export const RIGHTS_DOCUMENT_SKIP_MAX = 0.15;

export type RightsPrescreenJudgment = {
  looksLikeRightsDocument: { noul: number };
};

export function shouldSkipRightsReview(
  judgment: RightsPrescreenJudgment | null | undefined
): boolean {
  const probability = judgment?.looksLikeRightsDocument?.noul;
  if (typeof probability !== "number" || !Number.isFinite(probability)) {
    return false;
  }
  return probability < RIGHTS_DOCUMENT_SKIP_MAX;
}
