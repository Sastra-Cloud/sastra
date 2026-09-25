import type { AgreementCitationSnapshot } from "@/lib/db/schema";
import type { AgreementEvidence } from "./retrieval";

export type RawAgreementAnswer = {
  status?: unknown;
  answer?: unknown;
  citations?: Array<{ chunk_id?: unknown; quote?: unknown }>;
};

function normalizeQuote(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function citationSnapshot(
  evidence: AgreementEvidence,
  quote: string
): AgreementCitationSnapshot {
  return {
    chunkId: evidence.id,
    documentId: evidence.documentId,
    fileId: evidence.fileId,
    attachmentId: evidence.attachmentId,
    documentName: evidence.documentName,
    label: evidence.label,
    section: evidence.section,
    pageStart: evidence.pageStart,
    pageEnd: evidence.pageEnd,
    quote,
    passage: evidence.content,
  };
}

export function validateAgreementAnswer(
  raw: RawAgreementAnswer,
  evidence: AgreementEvidence[]
): {
  status: "answered" | "not_stated" | "ambiguous";
  answer: string;
  citations: AgreementCitationSnapshot[];
  validation: string;
} {
  const status =
    raw.status === "answered" ||
    raw.status === "not_stated" ||
    raw.status === "ambiguous"
      ? raw.status
      : "ambiguous";
  const byId = new Map(evidence.map((chunk) => [chunk.id, chunk]));
  const citations: AgreementCitationSnapshot[] = [];
  const seen = new Set<string>();
  let rejected = 0;
  for (const candidate of raw.citations ?? []) {
    const chunkId = String(candidate.chunk_id ?? "");
    const quote = String(candidate.quote ?? "").trim();
    const chunk = byId.get(chunkId);
    if (
      !chunk ||
      normalizeQuote(quote).length < 8 ||
      !normalizeQuote(chunk.content).includes(normalizeQuote(quote))
    ) {
      rejected += 1;
      continue;
    }
    const key = `${chunkId}\0${normalizeQuote(quote)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    citations.push(citationSnapshot(chunk, quote));
  }

  if (status === "answered" && citations.length === 0) {
    return {
      status: "ambiguous",
      answer:
        "I couldn’t verify an answer from the selected agreements. Try asking more specifically or open the source documents to review the relevant language.",
      citations: [],
      validation: `downgraded_uncited${rejected ? `_${rejected}_rejected` : ""}`,
    };
  }
  return {
    status,
    answer:
      String(raw.answer ?? "").trim() ||
      "The selected agreements do not state this clearly.",
    citations,
    validation: rejected ? `valid_with_${rejected}_rejected` : "valid",
  };
}

