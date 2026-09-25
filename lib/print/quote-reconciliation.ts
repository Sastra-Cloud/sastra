import {
  resolveFinalPrintPaymentAmount,
  type ParsedPrinterQuote,
} from "@/lib/print/parser";

type ComparableQuote = Pick<
  ParsedPrinterQuote,
  | "kind"
  | "invoiceNumber"
  | "issueDate"
  | "title"
  | "quantityCps"
  | "unitPrice"
  | "totalAmount"
  | "depositAmount"
  | "balanceAmount"
  | "currency"
  | "trimWidthMm"
  | "trimHeightMm"
  | "textPages"
  | "coverPages"
  | "textSpec"
  | "coverSpec"
  | "binding"
  | "deliveryLocation"
  | "paymentTerms"
>;

const NUMERIC_FIELDS = [
  "quantityCps",
  "unitPrice",
  "totalAmount",
  "depositAmount",
  "balanceAmount",
  "trimWidthMm",
  "trimHeightMm",
  "textPages",
  "coverPages",
] as const;

const TEXT_FIELDS = [
  "invoiceNumber",
  "issueDate",
  "title",
  "currency",
  "textSpec",
  "coverSpec",
  "binding",
  "deliveryLocation",
  "paymentTerms",
] as const;

function normalizedText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function quoteIdentityKind(kind: ParsedPrinterQuote["kind"] | string) {
  return kind === "quote" || kind === "invoice" ? "quote_or_invoice" : kind;
}

/**
 * Whether a newly parsed email contains a meaningful revision to an existing
 * quote. Missing fields in a short follow-up are treated as "not restated", not
 * as instructions to erase older data.
 */
export function quoteHasMeaningfulChanges(
  existing: ComparableQuote,
  incoming: ComparableQuote
): boolean {
  if (quoteIdentityKind(existing.kind) !== quoteIdentityKind(incoming.kind)) {
    return true;
  }

  for (const field of NUMERIC_FIELDS) {
    const next = incoming[field];
    if (next == null) continue;
    const current = existing[field];
    if (current == null || Number(current) !== Number(next)) return true;
  }

  for (const field of TEXT_FIELDS) {
    const next = incoming[field];
    if (next == null || next.trim() === "") continue;
    const current = existing[field];
    if (current == null || normalizedText(current) !== normalizedText(next)) {
      return true;
    }
  }

  return false;
}

/** Stable key for collapsing repeated tiers within one extraction result. */
export function quoteRevisionKey(quote: ComparableQuote): string | null {
  const kind = quoteIdentityKind(quote.kind);
  if (quote.quantityCps != null) return `${kind}:qty:${quote.quantityCps}`;
  const invoiceNumber = quote.invoiceNumber?.trim().toLowerCase();
  return invoiceNumber ? `${kind}:invoice:${invoiceNumber}` : null;
}

/** Which generated payment should inherit an accepted invoice's file. */
export function invoiceFilePaymentKinds(
  kind: ParsedPrinterQuote["kind"] | string
): Array<"deposit" | "final" | "full"> {
  // A staged deposit invoice normally states the complete order total and
  // payment terms, so it is valid finance support for both the deposit and the
  // deterministic remaining-balance row. A later final invoice can replace it
  // on the final row after its own explicit review.
  if (kind === "deposit_invoice") return ["deposit", "final"];
  if (kind === "final_invoice") return ["final", "full"];
  if (kind === "invoice") return ["deposit", "final", "full"];
  return [];
}

export function isPrintInvoiceKind(
  kind: ParsedPrinterQuote["kind"] | string
): boolean {
  return (
    kind === "invoice" ||
    kind === "deposit_invoice" ||
    kind === "final_invoice"
  );
}

export function isPendingPrintInvoiceReview(input: {
  kind: ParsedPrinterQuote["kind"] | string;
  reviewStatus: string;
}): boolean {
  return input.reviewStatus === "suggested" && isPrintInvoiceKind(input.kind);
}

export type AcceptedQuotePaymentPlan = Array<{
  kind: "deposit" | "final" | "full";
  amount: string;
}>;

/**
 * Payment rows implied by an accepted quote/invoice. A final invoice is only a
 * request for the remaining payment even when it repeats the original deposit
 * and order total for context; it must never recreate the deposit.
 */
export function acceptedQuotePaymentPlan(
  quote: {
    kind: ParsedPrinterQuote["kind"] | string;
    totalAmount: string | number | null | undefined;
    depositAmount: string | number | null | undefined;
    balanceAmount: string | number | null | undefined;
  }
): AcceptedQuotePaymentPlan {
  const deposit = quote.depositAmount ? Number(quote.depositAmount) : 0;
  const finalAmount = resolveFinalPrintPaymentAmount(quote);
  const plan: AcceptedQuotePaymentPlan = [];

  if (quote.kind === "final_invoice") {
    if (finalAmount && Number(finalAmount) > 0) {
      plan.push({ kind: "final", amount: finalAmount });
    }
    return plan;
  }

  if (deposit > 0) {
    plan.push({ kind: "deposit", amount: deposit.toFixed(2) });
  }
  if (finalAmount && Number(finalAmount) > 0) {
    plan.push({
      kind: deposit > 0 ? "final" : "full",
      amount: finalAmount,
    });
  }
  return plan;
}
