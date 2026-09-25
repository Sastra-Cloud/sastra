import "server-only";

import { eq } from "drizzle-orm";

import { aiStructured } from "@/lib/ai/openrouter";
import { db } from "@/lib/db";
import { printRuns } from "@/lib/db/schema";
import { currencyStatedIn, selfCheckFlags } from "@/lib/print/cross-check";
import {
  parsedTextQuotes,
  quoteExtractionText,
} from "@/lib/print/email-text-quote";
import { upsertEmailSuggestedQuote } from "@/lib/print/extract";
import { reconcileTextQuotes } from "@/lib/print/text-quote-reconcile";
import {
  bumpJobAttempt,
  extractionErrorMessage,
  getOrCreateExtractionJob,
  markJobFailed,
  markJobSucceeded,
} from "@/lib/print/extraction-jobs";
import { normalizePrintQuoteExtract } from "@/lib/print/extract-schema";
import type { ParsedPrinterQuote } from "@/lib/print/parser";
import { quoteRevisionKey } from "@/lib/print/quote-reconciliation";
import type { PrintExtractionSource, PrintReviewFlag } from "@/lib/print/review-flags";
import {
  PRINT_TEXT_QUOTE_JSON_SCHEMA,
  PRINT_TEXT_QUOTE_SYSTEM_PROMPT,
} from "@/lib/print/text-extract-schema";

function hasQuoteValues(parsed: ParsedPrinterQuote): boolean {
  return !!(
    parsed.invoiceNumber ||
    parsed.quantityCps ||
    parsed.unitPrice ||
    parsed.totalAmount ||
    parsed.depositAmount ||
    parsed.balanceAmount
  );
}

/** Ask the model to extract quote tiers from the email body. Throws on failure. */
async function aiExtractTextQuotes(
  bodyText: string,
  meta: { projectId: string; runId: string; actorUserId: string | null }
): Promise<ParsedPrinterQuote[]> {
  const raw = await aiStructured(
    "print_text_quote_extract",
    [
      { role: "system", content: PRINT_TEXT_QUOTE_SYSTEM_PROMPT },
      { role: "user", content: bodyText.slice(0, 20_000) },
    ],
    { name: "print_text_quotes", schema: PRINT_TEXT_QUOTE_JSON_SCHEMA },
    {
      metering: {
        scope: "workspace",
        feature: "print",
        operation: "extract_text_quote",
        taskKey: "print_text_quote_extract",
        actorUserId: meta.actorUserId,
        projectId: meta.projectId,
        entityType: "print_run",
        entityId: meta.runId,
      },
    }
  );
  const list = Array.isArray((raw as { quotes?: unknown[] }).quotes)
    ? (raw as { quotes: unknown[] }).quotes
    : [];
  return list
    .map((item) => normalizePrintQuoteExtract(item))
    .filter(hasQuoteValues);
}

type QuoteToInsert = {
  quote: ParsedPrinterQuote;
  flags: PrintReviewFlag[];
  source: PrintExtractionSource;
};

/**
 * Save suggested quotes, collapsing repeats within one extraction and updating
 * the active suggestion for a tier across later messages. Returns the count of
 * genuinely new rows plus the first affected quote id.
 */
async function insertQuotes(
  run: { id: string; projectId: string; contactId: string | null },
  quotes: QuoteToInsert[],
  meta: {
    sourceThreadId?: string | null;
    sourceMessageId?: string | null;
    actorUserId: string | null;
  }
): Promise<{ created: number; firstQuoteId: string | null }> {
  const seenKeys = new Set<string>();
  let sawUnkeyed = false;

  let created = 0;
  let firstQuoteId: string | null = null;
  for (const item of quotes) {
    const key = quoteRevisionKey(item.quote);
    if (key) {
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
    } else if (meta.sourceMessageId && sawUnkeyed) {
      continue; // one un-keyed quote per message is enough
    } else if (meta.sourceMessageId) {
      sawUnkeyed = true;
    }
    const saved = await upsertEmailSuggestedQuote(run, item.quote, meta.actorUserId, {
      sourceThreadId: meta.sourceThreadId,
      sourceMessageId: meta.sourceMessageId,
      reviewFlags: item.flags,
      extractionSource: item.source,
    });
    firstQuoteId ??= saved.id;
    if (saved.disposition === "created") created += 1;
  }
  return { created, firstQuoteId };
}

/**
 * AI-first extraction of printer quote tiers from an email body, cross-checked
 * against the regex parser. Runs only when the text is quote-like (the regex
 * parser found quote values) to control cost. On AI failure it falls back to the
 * regex-parsed quotes so nothing is lost — flagged so a manager knows. Everything
 * is inserted as `suggested`; nothing is auto-accepted.
 */
export async function runTextQuoteExtraction(input: {
  bodyText: string | null;
  includeQuotedHistory?: boolean;
  projectId: string;
  runId: string;
  sourceThreadId?: string | null;
  sourceMessageId?: string | null;
  actorUserId: string | null;
}): Promise<{ created: number }> {
  const sourceText = quoteExtractionText(input.bodyText, {
    includeQuotedHistory: input.includeQuotedHistory,
  });
  const regexQuotes = parsedTextQuotes(sourceText, { includeQuotedHistory: true });
  // Gate: only spend an AI call when the text already looks like a printer quote.
  if (!regexQuotes.length || !sourceText) return { created: 0 };

  const [run] = await db
    .select({
      id: printRuns.id,
      projectId: printRuns.projectId,
      contactId: printRuns.contactId,
    })
    .from(printRuns)
    .where(eq(printRuns.id, input.runId))
    .limit(1);
  if (!run) return { created: 0 };

  // Durable job only when tied to a source message (email ingest / reprocess).
  let jobId: string | null = null;
  if (input.sourceMessageId) {
    const { job, isNew } = await getOrCreateExtractionJob({
      projectId: run.projectId,
      runId: run.id,
      kind: "email_text",
      sourceThreadId: input.sourceThreadId,
      sourceMessageId: input.sourceMessageId,
    });
    if (!isNew && job.status === "succeeded") return { created: 0 };
    jobId = job.id;
    await bumpJobAttempt(jobId);
  }

  const currencyStated = currencyStatedIn(sourceText);
  let aiQuotes: ParsedPrinterQuote[] | null = null;
  let aiError: string | null = null;
  try {
    aiQuotes = await aiExtractTextQuotes(sourceText, {
      projectId: run.projectId,
      runId: run.id,
      actorUserId: input.actorUserId,
    });
  } catch (err) {
    aiError = extractionErrorMessage(err);
  }

  let toInsert: QuoteToInsert[];
  const usedAi = !!(aiQuotes && aiQuotes.length);
  if (usedAi) {
    // Reconcile the AI tiers against the deterministic regex tiers: backfill any
    // price the model dropped (a smushed "0.61per cpy") and re-add any tier it
    // omitted entirely, so a priced tier is never lost. Recoveries are flagged.
    toInsert = reconcileTextQuotes(aiQuotes!, regexQuotes, { currencyStated });
  } else {
    // AI failed or returned nothing → fall back to the pattern parser so a quote
    // we could read before is never lost. Flag it as AI-failed for review.
    toInsert = regexQuotes.map((quote) => ({
      quote,
      source: "regex_fallback" as const,
      flags: [
        {
          field: "_extraction",
          kind: "ai_failed" as const,
          note: aiError ?? "AI returned no quotes; used the pattern parser.",
        },
        ...selfCheckFlags(quote, { currencyStated }),
      ],
    }));
  }

  const { created, firstQuoteId } = await insertQuotes(run, toInsert, {
    sourceThreadId: input.sourceThreadId,
    sourceMessageId: input.sourceMessageId,
    actorUserId: input.actorUserId,
  });

  if (jobId) {
    if (usedAi) await markJobSucceeded(jobId, firstQuoteId);
    else await markJobFailed(jobId, aiError ?? "AI returned no quotes.");
  }
  return { created };
}
