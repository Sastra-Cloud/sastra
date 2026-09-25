/** Durable role used on email-message attachments that are printer proofs. */
export const PRINT_PROOF_ATTACHMENT_LABEL = "print_proof";

const PROOF_FILENAME_RE =
  /\b(proof|galley|press[-\s]?ready|print[-\s]?ready)\b/i;
const PROOF_BODY_RE = /\b(proof|galley|press[-\s]?ready|print[-\s]?ready)\b/i;
const ATTACHMENT_BODY_RE =
  /\b(attach(?:ed|ment)?|enclos(?:ed|ure)|please\s+(?:kindly\s+)?find)\b/i;
const REVIEW_BODY_RE = /\b(approv(?:al|e|ed)|review|feedback|confirm)\b/i;

/**
 * Identify a PDF delivered as a printer proof without treating older quoted
 * proof history as evidence. Callers should pass only the newest reply text.
 */
export function looksLikePrintProofAttachment(input: {
  fileName: string;
  mimeType: string;
  newestBodyText?: string | null;
}): boolean {
  if (input.mimeType.toLowerCase() !== "application/pdf") return false;
  if (PROOF_FILENAME_RE.test(input.fileName)) return true;

  const body = input.newestBodyText ?? "";
  return (
    PROOF_BODY_RE.test(body) &&
    ATTACHMENT_BODY_RE.test(body) &&
    REVIEW_BODY_RE.test(body)
  );
}
