export type AgreementChunkEmbeddingStatus =
  | "pending"
  | "processing"
  | "ready"
  | "failed";

export type AgreementDocumentIndexStatus =
  | "pending"
  | "processing"
  | "ready"
  | "failed";

/**
 * A document stays in progress while useful work remains. Once no pending work
 * exists, any failed chunk makes the document actionable instead of leaving an
 * indefinite spinner. A parsed document with no chunks is also a failure.
 */
export function deriveAgreementDocumentIndexStatus(
  statuses: AgreementChunkEmbeddingStatus[]
): AgreementDocumentIndexStatus {
  if (statuses.includes("processing")) return "processing";
  if (statuses.includes("pending")) return "pending";
  if (statuses.length === 0 || statuses.includes("failed")) return "failed";
  return "ready";
}

export function friendlyAgreementIndexError(error: string | null) {
  if (!error) return "Sastra could not add this source to agreement search.";
  if (/timed out/i.test(error)) {
    return "The search provider timed out before this source could be added.";
  }
  return error;
}
