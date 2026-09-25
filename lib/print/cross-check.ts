import { parseFlexibleDate } from "@/lib/print/dates";
import type { ParsedPrinterQuote } from "@/lib/print/parser";
import type { PrintReviewFlag } from "@/lib/print/review-flags";

/**
 * Cross-check the AI's extracted quotes against the regex parser and against the
 * quote's own arithmetic, producing per-quote review flags. Pure — no AI/DB — so
 * it is fully unit-testable. Flags never block; they mark fields a manager should
 * confirm before accepting the (always `suggested`) quote.
 */

const MONEY_EPSILON = 0.01;
const RATE_EPSILON = 0.005;
const TOTAL_EPSILON = 0.05;

function num(v: string | number | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function moneyDiffers(a: string | null, b: string | null, epsilon: number): boolean {
  const na = num(a);
  const nb = num(b);
  if (na == null || nb == null) return false; // can't compare a missing value
  return Math.abs(na - nb) > epsilon;
}

function textDiffers(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() !== b.trim().toLowerCase();
}

/**
 * Self-consistency checks that need no regex counterpart: does quantity × unit
 * price match the stated total, was the currency assumed, was the date ambiguous.
 */
export function selfCheckFlags(
  quote: ParsedPrinterQuote,
  opts?: { rawIssueDate?: string | null; currencyStated?: boolean }
): PrintReviewFlag[] {
  const flags: PrintReviewFlag[] = [];

  const qty = num(quote.quantityCps);
  const unit = num(quote.unitPrice);
  const total = num(quote.totalAmount);
  if (qty != null && unit != null && total != null && qty > 0) {
    const computed = qty * unit;
    if (Math.abs(computed - total) > TOTAL_EPSILON) {
      flags.push({
        field: "totalAmount",
        kind: "computed_total_mismatch",
        aiValue: total.toFixed(2),
        note: `Quantity × unit price = ${computed.toFixed(2)}, but total is ${total.toFixed(2)}. Could be a fee, discount, or misread.`,
      });
    }
  }

  const deposit = num(quote.depositAmount);
  const balance = num(quote.balanceAmount);
  if (
    total != null &&
    deposit != null &&
    balance != null &&
    Math.abs(deposit + balance - total) > MONEY_EPSILON
  ) {
    flags.push({
      field: "balanceAmount",
      kind: "payment_split_mismatch",
      aiValue: balance.toFixed(2),
      note: `Deposit + balance = ${(deposit + balance).toFixed(2)}, but the invoice total is ${total.toFixed(2)}.`,
    });
  }

  if (opts?.currencyStated === false && (quote.currency ?? "USD") === "USD") {
    flags.push({
      field: "currency",
      kind: "currency_defaulted",
      aiValue: quote.currency ?? "USD",
      note: "No currency was stated in the source; assumed USD.",
    });
  }

  if (opts?.rawIssueDate && parseFlexibleDate(opts.rawIssueDate).ambiguous) {
    flags.push({
      field: "issueDate",
      kind: "ambiguous_date",
      aiValue: quote.issueDate,
      note: `The source date "${opts.rawIssueDate}" is ambiguous (day/month order); read as day-first.`,
    });
  }

  return flags;
}

/**
 * The regex tier that corresponds to an AI quote — matched by quantity, or the
 * lone regex quote when it's one-to-one. Exported so the extractor can recover a
 * price the model dropped from its regex counterpart.
 */
export function matchRegex(
  ai: ParsedPrinterQuote,
  regexQuotes: ParsedPrinterQuote[],
  soleFallback: ParsedPrinterQuote | null
): ParsedPrinterQuote | null {
  if (ai.quantityCps != null) {
    const byQty = regexQuotes.find((r) => r.quantityCps === ai.quantityCps);
    if (byQty) return byQty;
  }
  return soleFallback;
}

/**
 * Compare each AI quote against its regex counterpart (matched by quantity, or
 * one-to-one when there's a single quote each way). Returns one flag array per AI
 * quote, in the same order — so callers can zip flags onto the quotes.
 */
export function crossCheckQuotes(
  aiQuotes: ParsedPrinterQuote[],
  regexQuotes: ParsedPrinterQuote[]
): PrintReviewFlag[][] {
  const soleFallback =
    aiQuotes.length === 1 && regexQuotes.length === 1 ? regexQuotes[0] : null;

  return aiQuotes.map((ai) => {
    const flags: PrintReviewFlag[] = [];
    const regex = matchRegex(ai, regexQuotes, soleFallback);
    if (!regex) return flags;

    if (
      ai.quantityCps != null &&
      regex.quantityCps != null &&
      ai.quantityCps !== regex.quantityCps
    ) {
      flags.push({
        field: "quantityCps",
        kind: "regex_disagrees",
        aiValue: String(ai.quantityCps),
        regexValue: String(regex.quantityCps),
      });
    }
    if (moneyDiffers(ai.unitPrice, regex.unitPrice, RATE_EPSILON)) {
      flags.push({
        field: "unitPrice",
        kind: "regex_disagrees",
        aiValue: ai.unitPrice,
        regexValue: regex.unitPrice,
      });
    }
    if (moneyDiffers(ai.totalAmount, regex.totalAmount, MONEY_EPSILON)) {
      flags.push({
        field: "totalAmount",
        kind: "regex_disagrees",
        aiValue: ai.totalAmount,
        regexValue: regex.totalAmount,
      });
    }
    if (moneyDiffers(ai.depositAmount, regex.depositAmount, MONEY_EPSILON)) {
      flags.push({
        field: "depositAmount",
        kind: "regex_disagrees",
        aiValue: ai.depositAmount,
        regexValue: regex.depositAmount,
      });
    }
    if (moneyDiffers(ai.balanceAmount, regex.balanceAmount, MONEY_EPSILON)) {
      flags.push({
        field: "balanceAmount",
        kind: "regex_disagrees",
        aiValue: ai.balanceAmount,
        regexValue: regex.balanceAmount,
      });
    }
    if (textDiffers(ai.invoiceNumber, regex.invoiceNumber)) {
      flags.push({
        field: "invoiceNumber",
        kind: "regex_disagrees",
        aiValue: ai.invoiceNumber,
        regexValue: regex.invoiceNumber,
      });
    }
    if (textDiffers(ai.issueDate, regex.issueDate)) {
      flags.push({
        field: "issueDate",
        kind: "regex_disagrees",
        aiValue: ai.issueDate,
        regexValue: regex.issueDate,
      });
    }
    return flags;
  });
}

/** Does the text state any currency at all (so a USD default isn't an assumption)? */
export function currencyStatedIn(text: string | null | undefined): boolean {
  if (!text) return false;
  return /\b(usd|us\$|rmb|cny|eur|gbp|khr|\$|¥|€|£|₩|₹)\b|¥|€|£|\$/i.test(text);
}
