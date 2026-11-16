import { and, asc, desc, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { emailMessages, files, printQuotes, printRuns } from "@/lib/db/schema";
import { pastedEstimateSourceText, withQuoteSourceFlag } from "@/lib/print/estimate-intake";
import { latestReplyText } from "@/lib/email/follow-up-policy";
import {
  getBudgetPageBasis,
  getOrCreatePrintSettings,
  listPrintContacts,
} from "@/lib/print/queries";
import {
  estimatePrintPages,
  measurementUnit,
} from "@/lib/print/estimate";
import {
  BUDGET_ESTIMATE_KIND,
  canUseAsBudgetEstimate,
  reviewedFirstPrintQuote,
} from "@/lib/print/estimate-policy";
import { getPrintQuoteTotal } from "@/lib/print/quote-economics";
import { listEmailDraftsForProject } from "@/lib/email/draft-store";
import { PrintEstimatePanel } from "./print-estimate-panel";
import { listBookSpecPresets } from "@/lib/print/spec-preset-queries";

/** Manager-only host; proposals and active projects share the same workflow. */
export async function PrintEstimateSection({
  projectId,
  userId,
}: {
  projectId: string;
  userId: string;
}) {
  const [
    runs,
    quotes,
    productionRuns,
    productionQuotes,
    contacts,
    settings,
    basis,
    drafts,
    specPresets,
  ] = await Promise.all([
    db
      .select({ run: printRuns, file: files })
      .from(printRuns)
      .leftJoin(files, eq(files.id, printRuns.referenceFileId))
      .where(
        and(
          eq(printRuns.projectId, projectId),
          eq(printRuns.kind, BUDGET_ESTIMATE_KIND),
        ),
      )
      .orderBy(desc(printRuns.createdAt)),
    db
      .select({ quote: printQuotes, sourceText: emailMessages.bodyText, forwardedBy: emailMessages.forwardedByUserId })
      .from(printQuotes)
      .innerJoin(printRuns, eq(printRuns.id, printQuotes.runId))
      .leftJoin(emailMessages, eq(emailMessages.id, printQuotes.sourceMessageId))
      .where(
        and(
          eq(printRuns.projectId, projectId),
          eq(printRuns.kind, BUDGET_ESTIMATE_KIND),
        ),
      )
      .orderBy(desc(printQuotes.createdAt)),
    db
      .select()
      .from(printRuns)
      .where(
        and(
          eq(printRuns.projectId, projectId),
          eq(printRuns.kind, "first_print"),
          ne(printRuns.status, "cancelled"),
        ),
      )
      .orderBy(asc(printRuns.createdAt)),
    db
      .select({ quote: printQuotes, sourceText: emailMessages.bodyText, forwardedBy: emailMessages.forwardedByUserId })
      .from(printQuotes)
      .innerJoin(printRuns, eq(printRuns.id, printQuotes.runId))
      .leftJoin(emailMessages, eq(emailMessages.id, printQuotes.sourceMessageId))
      .where(
        and(
          eq(printRuns.projectId, projectId),
          eq(printRuns.kind, "first_print"),
        ),
      )
      .orderBy(asc(printQuotes.quantityCps), desc(printQuotes.createdAt)),
    listPrintContacts({ activeOnly: true }),
    getOrCreatePrintSettings(projectId),
    getBudgetPageBasis(projectId),
    listEmailDraftsForProject(userId, projectId),
    listBookSpecPresets(),
  ]);
  const contactName = (contactId: string | null) => {
    const contact = contacts.find((c) => c.id === contactId);
    return contact?.company || contact?.name || "Printer not specified";
  };
  const reviewed = reviewedFirstPrintQuote(
    productionRuns,
    productionQuotes.map(({ quote }) => quote),
  );
  const reviewedTotal = reviewed ? getPrintQuoteTotal(reviewed) : null;
  // Once a print-run price is reviewed it sets the budget, so offering other
  // tiers from that run would suggest a choice that changes nothing.
  const printRunSources = reviewed
    ? []
    : productionRuns.flatMap((run) => {
        const runQuotes = productionQuotes
          .map(({ quote }) => quote)
          .filter(
            (quote) =>
              quote.runId === run.id && canUseAsBudgetEstimate(run, quote),
          );
        return runQuotes.length ? [{ run, quotes: runQuotes }] : [];
      });
  const sourceTexts = new Map([...quotes, ...productionQuotes].map(row => [
    row.quote.id, row.forwardedBy ? row.sourceText : latestReplyText(row.sourceText ?? ""),
  ]));
  const toEstimateQuote = (q: typeof printQuotes.$inferSelect) => ({
    id: q.id,
    runId: q.runId,
    reviewStatus: q.reviewStatus,
    quantityCps: q.quantityCps,
    unitPrice: q.unitPrice,
    totalAmount: q.totalAmount,
    currency: q.currency,
    textPages: q.textPages,
    coverPages: q.coverPages,
    trimWidthMm: q.trimWidthMm,
    trimHeightMm: q.trimHeightMm,
    deliveryLocation: q.deliveryLocation,
    textSpec: q.textSpec,
    coverSpec: q.coverSpec,
    binding: q.binding,
    paymentTerms: q.paymentTerms,
    sourceThreadId: q.sourceThreadId,
    reviewFlags: withQuoteSourceFlag(q.reviewFlags ?? [], sourceTexts.get(q.id) ?? ""),
  });
  return (
    <PrintEstimatePanel
      projectId={projectId}
      contacts={contacts.map((c) => ({
        id: c.id,
        name: c.company || c.name,
        email: c.email,
      }))}
      defaultContactId={settings.defaultContactId}
      estimatedPages={estimatePrintPages({
        ...basis,
        languageExpansionFactor: settings.languageExpansionFactor,
      })}
      trimWidthIn={settings.trimWidthIn}
      trimHeightIn={settings.trimHeightIn}
      measurementUnit={measurementUnit(settings.measurementUnit)}
      specPresets={specPresets}
      reviewedPrintQuote={
        reviewed && reviewedTotal
          ? {
              currency: reviewed.currency,
              total: reviewedTotal.totalCost,
              quantityCps: reviewed.quantityCps,
            }
          : null
      }
      requests={[
        ...runs.map(({ run, file }) => ({
          id: run.id,
          status: run.status,
          contactName: contactName(run.contactId),
          pageCount: run.quotedTextPages ?? run.estimatedTextPages,
          quantities: run.requestedQuantities ?? [],
          referenceFileId: run.referenceFileId,
          attachment: file
            ? {
                name: file.originalName,
                mimeType: file.mimeType,
                sizeBytes: file.sizeBytes,
                previewUrl: `/api/files/${file.id}/download`,
              }
            : null,
          draft:
            drafts.find(
              (d) => d.kind === "print_rfq" && d.contextId === run.id,
            ) ?? null,
          fromPrintRun: false,
          sourceText: pastedEstimateSourceText(run.notes),
        })),
        ...printRunSources.map(({ run, quotes: runQuotes }) => ({
          id: run.id,
          status: run.status,
          contactName: contactName(run.contactId),
          pageCount: run.quotedTextPages ?? run.estimatedTextPages,
          quantities: [
            ...new Set(
              runQuotes.flatMap((q) => (q.quantityCps ? [q.quantityCps] : [])),
            ),
          ],
          referenceFileId: null,
          attachment: null,
          draft: null,
          fromPrintRun: true,
        })),
      ]}
      quotes={[
        ...quotes.map(({ quote }) => toEstimateQuote(quote)),
        ...printRunSources.flatMap(({ quotes: runQuotes }) =>
          runQuotes.map(toEstimateQuote),
        ),
      ]}
    />
  );
}
