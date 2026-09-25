export type CollapsibleEmailRightsReview = {
  id: string;
  fileId: string;
  kind: "signed_agreement" | "license_fee_receipt" | null;
  status: "pending" | "processing" | "ready" | "failed" | "approved" | "dismissed";
};

/**
 * A signed agreement is one document-level decision, even when intake queued a
 * project-scoped review for every project linked to the thread. Keep one ready
 * card for that file and let its project checklist define the real targets.
 */
export function collapseSignedAgreementReviews<
  T extends CollapsibleEmailRightsReview,
>(reviews: T[]): T[] {
  const representativeByFileId = new Map<string, string>();
  for (const review of reviews) {
    if (review.status === "ready" && review.kind === "signed_agreement") {
      representativeByFileId.set(
        review.fileId,
        representativeByFileId.get(review.fileId) ?? review.id
      );
    }
  }

  return reviews.filter((review) => {
    const representativeId = representativeByFileId.get(review.fileId);
    return !representativeId || review.id === representativeId;
  });
}

/** Return unique requested IDs only when every target is linked to the thread. */
export function validatedAgreementProjectIds(
  requestedProjectIds: string[],
  linkedProjectIds: string[]
): string[] | null {
  const requested = [...new Set(requestedProjectIds)];
  if (!requested.length) return null;
  const linked = new Set(linkedProjectIds);
  return requested.every((projectId) => linked.has(projectId))
    ? requested
    : null;
}
