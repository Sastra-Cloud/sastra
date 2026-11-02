import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { files, printQuotes, printRuns } from "@/lib/db/schema";
import {
  getBudgetPageBasis,
  getOrCreatePrintSettings,
  listPrintContacts,
} from "@/lib/print/queries";
import {
  estimatePrintPages,
  measurementUnit,
} from "@/lib/print/estimate";
import { BUDGET_ESTIMATE_KIND } from "@/lib/print/estimate-policy";
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
  const [runs, quotes, contacts, settings, basis, drafts, specPresets] = await Promise.all([
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
      .select({ quote: printQuotes })
      .from(printQuotes)
      .innerJoin(printRuns, eq(printRuns.id, printQuotes.runId))
      .where(
        and(
          eq(printRuns.projectId, projectId),
          eq(printRuns.kind, BUDGET_ESTIMATE_KIND),
        ),
      )
      .orderBy(desc(printQuotes.createdAt)),
    listPrintContacts({ activeOnly: true }),
    getOrCreatePrintSettings(projectId),
    getBudgetPageBasis(projectId),
    listEmailDraftsForProject(userId, projectId),
    listBookSpecPresets(),
  ]);
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
      requests={runs.map(({ run, file }) => ({
        id: run.id,
        status: run.status,
        contactName:
          contacts.find((c) => c.id === run.contactId)?.company ||
          contacts.find((c) => c.id === run.contactId)?.name ||
          "Printer",
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
      }))}
      quotes={quotes.map(({ quote: q }) => ({
        id: q.id,
        runId: q.runId,
        reviewStatus: q.reviewStatus,
        quantityCps: q.quantityCps,
        unitPrice: q.unitPrice,
        totalAmount: q.totalAmount,
        currency: q.currency,
        textPages: q.textPages,
        textSpec: q.textSpec,
        coverSpec: q.coverSpec,
        binding: q.binding,
        paymentTerms: q.paymentTerms,
        sourceThreadId: q.sourceThreadId,
        reviewFlags: q.reviewFlags ?? [],
      }))}
    />
  );
}
