/**
 * Review flags attached to an extracted print quote. They mark fields a manager
 * should double-check before accepting — the AI and the regex parser disagreed,
 * a total didn't match quantity × unit price, a currency was assumed, or a date
 * was ambiguous. Pure types + tiny helpers (no server/db imports) so both the
 * Drizzle schema and the cross-check logic can share them.
 */

export type PrintReviewFlagKind =
  | "regex_disagrees"
  | "regex_recovered"
  | "computed_total_mismatch"
  | "payment_split_mismatch"
  | "currency_defaulted"
  | "ambiguous_date"
  | "ai_failed";

export type PrintReviewFlag = {
  field: string;
  kind: PrintReviewFlagKind;
  aiValue?: string | null;
  regexValue?: string | null;
  note?: string;
};

/** Where an extracted quote's values came from. */
export type PrintExtractionSource =
  | "ai" // AI structured extraction from email text
  | "pdf_ai" // AI vision extraction from a PDF/image
  | "regex_fallback" // AI failed; pattern parser used instead
  | "regex" // pattern parser only (no AI attempted)
  | "manual"; // hand-entered

const FLAG_LABELS: Record<PrintReviewFlagKind, string> = {
  regex_disagrees: "AI and pattern parser disagree",
  regex_recovered: "Value recovered from the pattern parser",
  computed_total_mismatch: "Total ≠ quantity × unit price",
  payment_split_mismatch: "Deposit + balance ≠ total",
  currency_defaulted: "Currency assumed (none stated)",
  ambiguous_date: "Date order was ambiguous",
  ai_failed: "AI extraction failed — pattern parser used",
};

export function flagLabel(kind: PrintReviewFlagKind): string {
  return FLAG_LABELS[kind] ?? kind;
}
