import type { printQuotes } from "@/lib/db/schema";
import type { ParsedPrinterQuote } from "./parser";
import type { PrintExtractionSource, PrintReviewFlag } from "./review-flags";

type QuoteRun = { id: string; projectId: string; contactId: string | null };

export type SuggestedQuoteMeta = {
  sourceThreadId?: string | null;
  sourceMessageId?: string | null;
  reviewFlags?: PrintReviewFlag[];
  extractionSource?: PrintExtractionSource;
};

export function suggestedQuoteValues(
  run: QuoteRun,
  parsed: ParsedPrinterQuote,
  createdBy: string | null,
  meta?: SuggestedQuoteMeta
): typeof printQuotes.$inferInsert {
  return {
    projectId: run.projectId,
    runId: run.id,
    contactId: run.contactId,
    sourceThreadId: meta?.sourceThreadId ?? null,
    sourceMessageId: meta?.sourceMessageId ?? null,
    reviewFlags: meta?.reviewFlags?.length ? meta.reviewFlags : null,
    extractionSource: meta?.extractionSource ?? null,
    kind: parsed.kind,
    reviewStatus: "suggested",
    invoiceNumber: parsed.invoiceNumber,
    issueDate: parsed.issueDate,
    title: parsed.title,
    quantityCps: parsed.quantityCps,
    unitPrice: parsed.unitPrice,
    totalAmount: parsed.totalAmount,
    depositAmount: parsed.depositAmount,
    balanceAmount: parsed.balanceAmount,
    currency: parsed.currency,
    trimWidthMm: parsed.trimWidthMm,
    trimHeightMm: parsed.trimHeightMm,
    textPages: parsed.textPages,
    coverPages: parsed.coverPages,
    textSpec: parsed.textSpec,
    coverSpec: parsed.coverSpec,
    binding: parsed.binding,
    deliveryLocation: parsed.deliveryLocation,
    paymentTerms: parsed.paymentTerms,
    rawExtract: parsed,
    createdBy,
  };
}
