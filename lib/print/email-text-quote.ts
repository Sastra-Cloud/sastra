import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { printRuns, projects } from "@/lib/db/schema";
import { latestReplyText } from "@/lib/email/follow-up-policy";
import {
  DEFAULT_LANGUAGE_EXPANSION_FACTOR,
  estimatePrintPages,
  mmToIn,
} from "@/lib/print/estimate";
import {
  parsePrinterQuoteTextVariants,
  type ParsedPrinterQuote,
} from "@/lib/print/parser";
import {
  getBudgetPageBasis,
  getOrCreatePrintSettings,
} from "@/lib/print/queries";

function hasQuoteValues(parsed: ParsedPrinterQuote) {
  return !!(
    parsed.invoiceNumber ||
    parsed.quantityCps ||
    parsed.unitPrice ||
    parsed.totalAmount ||
    parsed.depositAmount ||
    parsed.balanceAmount
  );
}

export function quoteExtractionText(
  bodyText: string | null,
  options: { includeQuotedHistory?: boolean } = {}
): string {
  const fullText = bodyText?.trim() ?? "";
  if (!fullText) return "";
  return options.includeQuotedHistory ? fullText : latestReplyText(fullText);
}

export function parsedTextQuotes(
  bodyText: string | null,
  options: { includeQuotedHistory?: boolean } = {}
): ParsedPrinterQuote[] {
  const sourceText = quoteExtractionText(bodyText, options);
  if (!sourceText) return [];
  return parsePrinterQuoteTextVariants(sourceText).filter(hasQuoteValues);
}

function uniqueQuantities(parsedQuotes: ParsedPrinterQuote[]): number[] {
  return [
    ...new Set(
      parsedQuotes
        .map((quote) => quote.quantityCps)
        .filter((quantity): quantity is number => !!quantity && quantity > 0)
    ),
  ];
}

function trimSpec(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

function trimMmToIn(value: string | null, fallback: number): number {
  const mm = Number(value);
  if (!Number.isFinite(mm) || mm <= 0) return fallback;
  return mmToIn(mm);
}

export async function createRunFromTextQuote(input: {
  projectId: string;
  contactId: string | null;
  parsedQuotes: ParsedPrinterQuote[];
  actorUserId: string | null;
}): Promise<string | null> {
  if (!input.parsedQuotes.length) return null;

  const [existingRun] = await db
    .select({ id: printRuns.id })
    .from(printRuns)
    .where(eq(printRuns.projectId, input.projectId))
    .limit(1);
  if (existingRun) return null;

  const [[project], settings] = await Promise.all([
    db
      .select({ title: projects.title })
      .from(projects)
      .where(eq(projects.id, input.projectId))
      .limit(1),
    getOrCreatePrintSettings(input.projectId),
  ]);
  if (!project) return null;

  const parsed = input.parsedQuotes[0];
  const trimWidthIn = trimMmToIn(parsed.trimWidthMm, Number(settings.trimWidthIn));
  const trimHeightIn = trimMmToIn(parsed.trimHeightMm, Number(settings.trimHeightIn));
  const languageExpansionFactor =
    Number(settings.languageExpansionFactor) || DEFAULT_LANGUAGE_EXPANSION_FACTOR;
  const basis = await getBudgetPageBasis(input.projectId);
  const estimatedTextPages =
    parsed.textPages ??
    estimatePrintPages({
      wordCount: basis.wordCount,
      wordsPerPage: basis.wordsPerPage,
      sourcePageCount: basis.sourcePageCount,
      trimWidthIn,
      trimHeightIn,
      languageExpansionFactor,
    });
  const quantities = uniqueQuantities(input.parsedQuotes);

  const [run] = await db
    .insert(printRuns)
    .values({
      projectId: input.projectId,
      contactId: input.contactId ?? settings.defaultContactId,
      title: trimSpec(parsed.title) ?? project.title,
      status: "quote_received",
      requestedQuantities: quantities.length
        ? quantities
        : [1000, 2000, 3000, 4000, 5000],
      trimWidthIn: trimWidthIn.toFixed(2),
      trimHeightIn: trimHeightIn.toFixed(2),
      languageExpansionFactor: languageExpansionFactor.toFixed(2),
      estimatedTextPages,
      quotedTextPages: parsed.textPages,
      coverPages: parsed.coverPages ?? 4,
      textPaper: trimSpec(parsed.textSpec),
      coverPaper: trimSpec(parsed.coverSpec),
      binding: trimSpec(parsed.binding),
      deliveryLocation: trimSpec(parsed.deliveryLocation) ?? "",
      latestProofUrl: parsed.latestProofUrl,
      createdBy: input.actorUserId,
    })
    .returning({ id: printRuns.id });

  return run?.id ?? null;
}
