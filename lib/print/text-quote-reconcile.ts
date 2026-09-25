import {
  crossCheckQuotes,
  matchRegex,
  selfCheckFlags,
} from "@/lib/print/cross-check";
import type { ParsedPrinterQuote } from "@/lib/print/parser";
import type {
  PrintExtractionSource,
  PrintReviewFlag,
} from "@/lib/print/review-flags";

export type ReconciledQuote = {
  quote: ParsedPrinterQuote;
  flags: PrintReviewFlag[];
  source: PrintExtractionSource;
};

/**
 * The model sometimes returns a tier with a missing price or production spec.
 * The regex parser reads those deterministic fields, so fill any missing values
 * from the matched tier and flag the recovery. Mutates `quote` in place.
 */
function backfillMissingValues(
  quote: ParsedPrinterQuote,
  regex: ParsedPrinterQuote | null
): PrintReviewFlag[] {
  if (!regex) return [];
  const flags: PrintReviewFlag[] = [];
  if (quote.unitPrice == null && regex.unitPrice != null) {
    quote.unitPrice = regex.unitPrice;
    flags.push({
      field: "unitPrice",
      kind: "regex_recovered",
      regexValue: regex.unitPrice,
      note: "The per-copy price didn't come through the AI read; recovered from the pattern parser.",
    });
  }
  if (quote.totalAmount == null && regex.totalAmount != null) {
    quote.totalAmount = regex.totalAmount;
    flags.push({
      field: "totalAmount",
      kind: "regex_recovered",
      regexValue: regex.totalAmount,
      note: "The tier total didn't come through the AI read; recovered from the pattern parser.",
    });
  }
  const recoveredSpecs: string[] = [];
  const recover = <K extends keyof ParsedPrinterQuote>(key: K, label: string) => {
    if (quote[key] == null && regex[key] != null) {
      quote[key] = regex[key];
      recoveredSpecs.push(label);
    }
  };
  recover("title", "title");
  recover("trimWidthMm", "trim width");
  recover("trimHeightMm", "trim height");
  recover("textPages", "text pages");
  recover("coverPages", "cover pages");
  recover("textSpec", "text stock/spec");
  recover("coverSpec", "cover stock/spec");
  recover("binding", "binding");
  recover("deliveryLocation", "delivery");
  if (recoveredSpecs.length) {
    flags.push({
      field: "_specs",
      kind: "regex_recovered",
      note: `Recovered from the pattern parser: ${recoveredSpecs.join(", ")}.`,
    });
  }
  return flags;
}

/**
 * Reconcile the AI's extracted quote tiers with the deterministic regex tiers so
 * no priced tier is lost to an AI misread. Two failure modes are covered:
 *
 *  1. The AI returns a tier but drops its price (a smushed "0.61per cpy") — the
 *     price is backfilled from the matching regex tier.
 *  2. The AI omits a whole tier it couldn't parse — that regex tier is re-added,
 *     matched by quantity.
 *
 * Everything is flagged for manager review; nothing is auto-accepted. Pure (no
 * AI/DB) so the reconciliation is fully unit-testable.
 */
export function reconcileTextQuotes(
  aiQuotes: ParsedPrinterQuote[],
  regexQuotes: ParsedPrinterQuote[],
  opts: { currencyStated: boolean }
): ReconciledQuote[] {
  const soleFallback =
    aiQuotes.length === 1 && regexQuotes.length === 1 ? regexQuotes[0] : null;
  // Backfill before flagging so a recovered total is checked by self-check.
  const recoveredFlags = aiQuotes.map((quote) =>
    backfillMissingValues(quote, matchRegex(quote, regexQuotes, soleFallback))
  );
  const crossFlags = crossCheckQuotes(aiQuotes, regexQuotes);
  const reconciled: ReconciledQuote[] = aiQuotes.map((quote, i) => ({
    quote,
    source: "ai",
    flags: [
      ...selfCheckFlags(quote, {
        rawIssueDate: quote.issueDate,
        currencyStated: opts.currencyStated,
      }),
      ...crossFlags[i],
      ...recoveredFlags[i],
    ],
  }));

  // Re-add any regex tier the AI didn't return (matched by quantity). This is
  // what keeps a priced tier like "3000 @ 0.61per cpy" from vanishing when the
  // model returns only the other tiers.
  const aiQuantities = new Set(
    aiQuotes
      .map((quote) => quote.quantityCps)
      .filter((quantity): quantity is number => quantity != null)
  );
  for (const regexQuote of regexQuotes) {
    if (
      regexQuote.quantityCps == null ||
      aiQuantities.has(regexQuote.quantityCps)
    ) {
      continue;
    }
    reconciled.push({
      quote: regexQuote,
      source: "regex_fallback",
      flags: [
        {
          field: "_extraction",
          kind: "regex_recovered",
          note: "This tier was recovered from the pattern parser; the AI read left it out.",
        },
        ...selfCheckFlags(regexQuote, { currencyStated: opts.currencyStated }),
      ],
    });
  }
  return reconciled;
}
