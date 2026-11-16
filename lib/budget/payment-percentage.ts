export type PercentagePayment = {
  id: string;
  amount: string | number | null;
  currency: string;
  notes: string | null;
};

export type PaymentPercentageCalculation = {
  percentage: number;
  totalCents: number;
  amountCents: number;
  source: "payment_terms" | "quotation";
};

/** Legacy incoming rows sometimes contain an explicitly outgoing rights fee. */
export function isOutgoingPaymentTerms(notes: string | null | undefined): boolean {
  return /\b(?:fee|payment|payable)\s+to\s+(?:the\s+)?licensor\b/i.test(notes ?? "");
}

/** Round once in cents, using basis points for up to two percentage decimals. */
export function percentageAmountCents(total: number, percentage: number): number | null {
  const totalCents = Math.round(total * 100);
  const bps = Math.round(percentage * 100);
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0 ||
      !Number.isFinite(percentage) || percentage <= 0 || percentage > 100) return null;
  const product = totalCents * bps;
  if (!Number.isSafeInteger(product)) return null;
  const result = Math.round(product / 10_000);
  return result > 0 ? result : null;
}

function percentageInTerms(notes: string | null): number | null {
  const matches = [...(notes ?? "").matchAll(/(?<![\d.-])(\d+(?:\.\d{1,2})?)\s*%/g)];
  if (matches.length !== 1 || !/\bof\s+(?:the\s+)?total\b/i.test(notes ?? "")) return null;
  const value = Number(matches[0][1]);
  return value > 0 && value <= 100 ? value : null;
}

function statedTotals(notes: string | null, currency: string): number[] {
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const units = new Set([currency]);
  try {
    for (const locale of ["en-US", "en-GB"]) {
      const symbol = new Intl.NumberFormat(locale, { style: "currency", currency })
        .formatToParts(1).find((part) => part.type === "currency")?.value;
      if (symbol) units.add(symbol);
    }
  } catch { return []; }
  // A currency-tagged total beside the actual total-payment clause only.
  // Other amounts, including administration fees and foreign equivalents, stay separate.
  const pattern = new RegExp(
    `\\btotal\\s+(?:payment(?:\\s+to\\s+(?:the\\s+)?licensee)?|amount|funding)\\s*[:=(]?\\s*(?:${[...units].sort((a, b) => b.length - a.length).map(escape).join("|")})\\s*((?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d{1,2})?)(?![\\d.,])`, "gi"
  );
  return [...(notes ?? "").matchAll(pattern)].map((match) => Math.round(Number(match[1].replaceAll(",", "")) * 100));
}

/** Suggestions only: existing saved amounts always win. Nothing is posted here. */
export function suggestPercentagePayments(
  payments: PercentagePayment[],
  quotation?: { total: number; currency: string }
): Map<string, PaymentPercentageCalculation> {
  const result = new Map<string, PaymentPercentageCalculation>();
  for (const currency of new Set(payments.map((payment) => payment.currency))) {
    const scope = payments.filter((payment) => payment.currency === currency && !isOutgoingPaymentTerms(payment.notes));
    const totals = [...new Set(scope.flatMap((payment) => statedTotals(payment.notes, currency)))];
    if (totals.length > 1) continue; // Conflicting agreement totals need human review.
    const totalCents = totals[0] ?? (quotation?.currency === currency ? Math.round(quotation.total * 100) : 0);
    const percentages = scope.flatMap((payment) => {
      const percentage = percentageInTerms(payment.notes);
      if (percentage == null) return [];
      const amountCents = percentageAmountCents(totalCents / 100, percentage);
      return amountCents == null ? [] : [{ payment, percentage, amountCents }];
    });
    // A complete percentage schedule reconciles to the cent. A saved first
    // installment is kept; the final missing installment absorbs rounding only.
    const final = percentages.findLast((row) => Number(row.payment.amount) === 0);
    if (final && percentages.length > 1 &&
        percentages.reduce((sum, row) => sum + Math.round(row.percentage * 100), 0) === 10_000) {
      const others = percentages.filter((row) => row !== final).reduce((sum, row) =>
        sum + (Number(row.payment.amount) > 0 ? Math.round(Number(row.payment.amount) * 100) : row.amountCents), 0);
      const remainder = totalCents - others;
      if (remainder > 0 && Math.abs(remainder - final.amountCents) <= 1) final.amountCents = remainder;
    }
    for (const row of percentages) {
      if (Number(row.payment.amount) !== 0) continue;
      result.set(row.payment.id, {
        percentage: row.percentage, totalCents, amountCents: row.amountCents,
        source: totals.length ? "payment_terms" : "quotation",
      });
    }
  }
  return result;
}
