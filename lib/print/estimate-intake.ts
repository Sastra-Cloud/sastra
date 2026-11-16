import type { PrintReviewFlag } from "./review-flags";

export function pastedEstimateSourceText(notes: string | null): string | null {
  const match = notes?.match(/^(?:Reused|Pasted) quote for budget planning\.\n\n([\s\S]+)$/);
  return match?.[1] ?? null;
}

/** Explicit reuse language, not an assumption based on matching specifications. */
export function reusedQuoteFlag(text: string, explicitlyReused = false): PrintReviewFlag | null {
  const negated = /\b(?:do\s+not|don't|cannot|can't|not)\s+re[- ]?us(?:e|ed|ing)\b/i.test(text);
  const reuse = !negated && /\bre[- ]?us(?:e|ed|ing)\b[^\n.!?]{0,120}\b(?:quotes?|prices?|pricing|costs?)\b/i.test(text);
  if (!explicitlyReused && !reuse) return null;
  const reference = text.match(/\bsame\s+(?:specs|specifications)\s+as\s+([^\n,.;:]{1,160})/i)?.[1]?.trim();
  return {
    field: "_source",
    kind: "reused_quote",
    note: reference
      ? `Price reused from ${reference}. Check that the specifications still match.`
      : "Price reused from another book. Check that the specifications still match.",
  };
}

export function withQuoteSourceFlag(flags: PrintReviewFlag[], text: string, explicitlyReused = false): PrintReviewFlag[] {
  const flag = reusedQuoteFlag(text, explicitlyReused);
  return flag && !flags.some(item => item.kind === flag.kind) ? [...flags, flag] : flags;
}
