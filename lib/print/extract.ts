import "server-only";

import { revalidatePath } from "next/cache";
import { and, desc, eq, inArray } from "drizzle-orm";

import { aiStructuredFromDocument, type DocPart } from "@/lib/ai/openrouter";
import { withTimeout } from "@/lib/ai/retry";
import type { AiMetering } from "@/lib/ai/usage";
import { db } from "@/lib/db";
import {
  fileAttachments,
  files,
  printPayments,
  printQuotes,
  printRuns,
  projects,
} from "@/lib/db/schema";
import { presignGet } from "@/lib/r2";
import {
  normalizePrintQuoteExtract,
  PRINT_QUOTE_JSON_SCHEMA,
  PRINT_QUOTE_SYSTEM_PROMPT,
} from "@/lib/print/extract-schema";
import { selfCheckFlags } from "@/lib/print/cross-check";
import { syncPrintEstimateToBudget } from "@/lib/print/budget-sync";
import {
  bumpJobAttempt,
  extractionErrorMessage,
  getOrCreateExtractionJob,
  markJobFailed,
  markJobSucceeded,
} from "@/lib/print/extraction-jobs";
import type { ParsedPrinterQuote } from "@/lib/print/parser";
import {
  invoiceFilePaymentKinds,
  quoteHasMeaningfulChanges,
  quoteIdentityKind,
} from "@/lib/print/quote-reconciliation";
import type { PrintExtractionSource, PrintReviewFlag } from "@/lib/print/review-flags";

type QuoteRun = { id: string; projectId: string; contactId: string | null };

export type SuggestedQuoteMeta = {
  sourceThreadId?: string | null;
  sourceMessageId?: string | null;
  reviewFlags?: PrintReviewFlag[];
  extractionSource?: PrintExtractionSource;
};

export type SuggestedQuoteSaveResult = {
  id: string;
  disposition: "created" | "updated" | "unchanged";
};

function suggestedQuoteValues(
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

async function propagateProofUrl(runId: string, latestProofUrl: string | null) {
  if (!latestProofUrl) return;
  await db
    .update(printRuns)
    .set({ latestProofUrl, updatedAt: new Date() })
    .where(eq(printRuns.id, runId));
}

function quoteIdentityCondition(runId: string, parsed: ParsedPrinterQuote) {
  const kindIdentity =
    quoteIdentityKind(parsed.kind) === "quote_or_invoice"
      ? inArray(printQuotes.kind, ["quote", "invoice"])
      : eq(printQuotes.kind, parsed.kind);
  if (parsed.quantityCps != null) {
    return and(
      eq(printQuotes.runId, runId),
      kindIdentity,
      eq(printQuotes.quantityCps, parsed.quantityCps)
    );
  }
  if (parsed.invoiceNumber) {
    return and(
      eq(printQuotes.runId, runId),
      kindIdentity,
      eq(printQuotes.invoiceNumber, parsed.invoiceNumber)
    );
  }
  return null;
}

/**
 * Whether an extracted quote carries real finance evidence — a price, total, or
 * invoice number. A quantity alone does NOT count: a book or cover PDF run
 * through the vision model can come back with a spurious copy count and nothing
 * else, and that must not become a suggested quote. A genuine quote/invoice
 * always states at least one money value or an invoice number.
 */
function hasFinancialSignal(q: ParsedPrinterQuote): boolean {
  return (
    q.unitPrice != null ||
    q.totalAmount != null ||
    q.depositAmount != null ||
    q.balanceAmount != null ||
    !!q.invoiceNumber
  );
}

/**
 * Download a printer quote/invoice file from R2 and extract its fields with the
 * vision model, returning the same shape as the regex parser. Throws on
 * download/timeout errors; returns null if the file is missing or not ready.
 */
export async function runPrintQuoteExtraction(input: {
  fileId: string;
  projectId: string;
  actorUserId?: string | null;
  runId?: string | null;
}): Promise<ParsedPrinterQuote | null> {
  const [file] = await db
    .select()
    .from(files)
    .where(eq(files.id, input.fileId))
    .limit(1);
  if (!file || file.status !== "ready") return null;

  const url = await presignGet(file.r2Key);
  const res = await withTimeout(fetch(url), 30_000, "Downloading the invoice");
  if (!res.ok) throw new Error("Could not download the invoice from storage.");
  const buf = Buffer.from(await res.arrayBuffer());

  const mime = file.mimeType;
  let parts: DocPart[];
  let pdf = false;
  if (mime === "application/pdf") {
    parts = [
      { type: "text", text: "Extract the printer quote/invoice fields as JSON." },
      {
        type: "file",
        file: {
          filename: file.originalName,
          file_data: `data:application/pdf;base64,${buf.toString("base64")}`,
        },
      },
    ];
    pdf = true;
  } else if (mime.startsWith("image/")) {
    parts = [
      {
        type: "text",
        text: "Extract the printer quote/invoice fields from this image as JSON.",
      },
      {
        type: "image_url",
        image_url: { url: `data:${mime};base64,${buf.toString("base64")}` },
      },
    ];
  } else if (mime.includes("wordprocessingml")) {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: buf });
    parts = [{ type: "text", text: value }];
  } else {
    parts = [{ type: "text", text: buf.toString("utf8") }];
  }

  const metering: AiMetering = {
    scope: "workspace",
    feature: "print",
    operation: "extract_quote",
    taskKey: "print_quote_extract",
    actorUserId: input.actorUserId ?? null,
    projectId: input.projectId,
    entityType: "print_quote",
    entityId: input.runId ?? input.fileId,
    metadata: { mimeType: file.mimeType, fileName: file.originalName },
  };

  // Timeout + retry are handled inside `aiStructuredFromDocument` (via the shared
  // retry wrapper); no outer race needed here.
  const { data } = await aiStructuredFromDocument(
    "print_quote_extract",
    PRINT_QUOTE_SYSTEM_PROMPT,
    parts,
    { name: "print_quote_extraction", schema: PRINT_QUOTE_JSON_SCHEMA },
    { pdf, metering }
  );
  return normalizePrintQuoteExtract(data, { sourceFileName: file.originalName });
}

/**
 * Save a `suggested` print quote from a parsed extraction (shared by the
 * paste-text, file-upload, and email auto-ingest paths so the mapping stays
 * identical). A quantity tier refreshes its existing active suggestion rather
 * than violating the one-suggestion-per-tier invariant. Also propagates any
 * proof URL onto the run.
 */
export async function insertSuggestedQuote(
  run: QuoteRun,
  parsed: ParsedPrinterQuote,
  createdBy: string | null,
  meta?: SuggestedQuoteMeta
): Promise<string> {
  const values = suggestedQuoteValues(run, parsed, createdBy, meta);
  const [inserted] = parsed.quantityCps == null
    ? await db
        .insert(printQuotes)
        .values(values)
        .returning({ id: printQuotes.id })
    : await db
        .insert(printQuotes)
        .values(values)
        .onConflictDoNothing()
        .returning({ id: printQuotes.id });
  let quoteId = inserted?.id ?? null;
  if (!quoteId) {
    const identity = quoteIdentityCondition(run.id, parsed);
    const [suggested] = identity
      ? await db
          .select({ id: printQuotes.id })
          .from(printQuotes)
          .where(and(identity, eq(printQuotes.reviewStatus, "suggested")))
          .limit(1)
      : [];
    if (!suggested) throw new Error("Could not reconcile the suggested quote tier.");
    await db
      .update(printQuotes)
      .set(mergeSuggestedQuotePatch(run, parsed, meta ?? {}))
      .where(eq(printQuotes.id, suggested.id));
    quoteId = suggested.id;
  }
  await propagateProofUrl(run.id, parsed.latestProofUrl);
  // A new printer quote (manual paste, uploaded PDF, or auto email) refreshes
  // the project-level Print / Ship estimate.
  await syncPrintEstimateToBudget(run.projectId);
  return quoteId;
}

function mergeSuggestedQuotePatch(
  run: QuoteRun,
  parsed: ParsedPrinterQuote,
  meta: SuggestedQuoteMeta
): Partial<typeof printQuotes.$inferInsert> {
  const patch: Partial<typeof printQuotes.$inferInsert> = {
    contactId: run.contactId,
    sourceThreadId: meta.sourceThreadId ?? null,
    sourceMessageId: meta.sourceMessageId ?? null,
    reviewFlags: meta.reviewFlags?.length ? meta.reviewFlags : null,
    extractionSource: meta.extractionSource ?? null,
    kind: parsed.kind,
    currency: parsed.currency,
    rawExtract: parsed,
    updatedAt: new Date(),
  };
  if (parsed.invoiceNumber != null) patch.invoiceNumber = parsed.invoiceNumber;
  if (parsed.issueDate != null) patch.issueDate = parsed.issueDate;
  if (parsed.title != null) patch.title = parsed.title;
  if (parsed.quantityCps != null) patch.quantityCps = parsed.quantityCps;
  if (parsed.unitPrice != null) patch.unitPrice = parsed.unitPrice;
  if (parsed.totalAmount != null) patch.totalAmount = parsed.totalAmount;
  if (parsed.depositAmount != null) patch.depositAmount = parsed.depositAmount;
  if (parsed.balanceAmount != null) patch.balanceAmount = parsed.balanceAmount;
  if (parsed.trimWidthMm != null) patch.trimWidthMm = parsed.trimWidthMm;
  if (parsed.trimHeightMm != null) patch.trimHeightMm = parsed.trimHeightMm;
  if (parsed.textPages != null) patch.textPages = parsed.textPages;
  if (parsed.coverPages != null) patch.coverPages = parsed.coverPages;
  if (parsed.textSpec != null) patch.textSpec = parsed.textSpec;
  if (parsed.coverSpec != null) patch.coverSpec = parsed.coverSpec;
  if (parsed.binding != null) patch.binding = parsed.binding;
  if (parsed.deliveryLocation != null)
    patch.deliveryLocation = parsed.deliveryLocation;
  if (parsed.paymentTerms != null) patch.paymentTerms = parsed.paymentTerms;
  return patch;
}

/**
 * Save a quote parsed from captured email without creating another copy of the
 * same active tier. Repeated follow-ups refresh the suggested row. Accepted
 * rows are never changed: an identical repeat is ignored, while changed values
 * create one new suggestion for manager review.
 */
export async function upsertEmailSuggestedQuote(
  run: QuoteRun,
  parsed: ParsedPrinterQuote,
  createdBy: string | null,
  meta: SuggestedQuoteMeta
): Promise<SuggestedQuoteSaveResult> {
  const identity = quoteIdentityCondition(run.id, parsed);

  if (!identity) {
    return {
      id: await insertSuggestedQuote(run, parsed, createdBy, meta),
      disposition: "created",
    };
  }

  const [suggested] = await db
    .select()
    .from(printQuotes)
    .where(and(identity, eq(printQuotes.reviewStatus, "suggested")))
    .orderBy(desc(printQuotes.updatedAt))
    .limit(1);
  const patch = mergeSuggestedQuotePatch(run, parsed, meta);
  if (suggested) {
    await db.update(printQuotes).set(patch).where(eq(printQuotes.id, suggested.id));
    await propagateProofUrl(run.id, parsed.latestProofUrl);
    await syncPrintEstimateToBudget(run.projectId);
    return { id: suggested.id, disposition: "updated" };
  }

  const [accepted] = await db
    .select()
    .from(printQuotes)
    .where(and(identity, eq(printQuotes.reviewStatus, "accepted")))
    .orderBy(desc(printQuotes.updatedAt))
    .limit(1);
  if (
    accepted &&
    !quoteHasMeaningfulChanges(
      { ...accepted, kind: accepted.kind as ParsedPrinterQuote["kind"] },
      parsed
    )
  ) {
    await propagateProofUrl(run.id, parsed.latestProofUrl);
    return { id: accepted.id, disposition: "unchanged" };
  }

  if (parsed.quantityCps == null) {
    return {
      id: await insertSuggestedQuote(run, parsed, createdBy, meta),
      disposition: "created",
    };
  }

  // A targetless conflict-ignore works with the expression-based partial index:
  // concurrent quote/invoice parser labels converge, then the loser refreshes
  // the row inserted by the winner.
  const [inserted] = await db
    .insert(printQuotes)
    .values(suggestedQuoteValues(run, parsed, createdBy, meta))
    .onConflictDoNothing()
    .returning({ id: printQuotes.id });
  let saved = inserted;
  let disposition: SuggestedQuoteSaveResult["disposition"] = "created";
  if (!saved) {
    const [concurrent] = await db
      .select({ id: printQuotes.id })
      .from(printQuotes)
      .where(and(identity, eq(printQuotes.reviewStatus, "suggested")))
      .limit(1);
    if (!concurrent) throw new Error("Could not reconcile the email quote tier.");
    await db.update(printQuotes).set(patch).where(eq(printQuotes.id, concurrent.id));
    saved = concurrent;
    disposition = "updated";
  }
  await propagateProofUrl(run.id, parsed.latestProofUrl);
  await syncPrintEstimateToBudget(run.projectId);
  return { id: saved.id, disposition };
}

async function revalidatePrintPaths(projectId: string) {
  const [project] = await db
    .select({ slug: projects.slug })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return;
  revalidatePath(`/projects/${project.slug}/print`);
  revalidatePath(`/projects/${project.slug}`);
}

/** Replace copied deposit support once a reviewed final-invoice PDF exists. */
async function preferFinalInvoiceFiles(runId: string): Promise<void> {
  const finalRows = await db
    .select({
      quoteId: printQuotes.id,
      fileId: fileAttachments.fileId,
    })
    .from(printQuotes)
    .innerJoin(
      fileAttachments,
      and(
        eq(fileAttachments.targetType, "print_quote"),
        eq(fileAttachments.targetId, printQuotes.id)
      )
    )
    .where(
      and(
        eq(printQuotes.runId, runId),
        eq(printQuotes.kind, "final_invoice"),
        eq(printQuotes.reviewStatus, "accepted")
      )
    )
    .orderBy(
      desc(printQuotes.acceptedAt),
      desc(printQuotes.createdAt),
      desc(fileAttachments.createdAt)
    );
  const preferredQuoteId = finalRows[0]?.quoteId;
  if (!preferredQuoteId) return;

  const preferredFileIds = [
    ...new Set(
      finalRows
        .filter((row) => row.quoteId === preferredQuoteId)
        .map((row) => row.fileId)
    ),
  ];
  const finalPayments = await db
    .select({ id: printPayments.id })
    .from(printPayments)
    .where(
      and(
        eq(printPayments.runId, runId),
        inArray(printPayments.kind, ["final", "full"])
      )
    );
  if (!preferredFileIds.length || !finalPayments.length) return;

  const paymentIds = finalPayments.map((payment) => payment.id);
  const existingPreferred = await db
    .select({
      targetId: fileAttachments.targetId,
      fileId: fileAttachments.fileId,
    })
    .from(fileAttachments)
    .where(
      and(
        eq(fileAttachments.targetType, "print_payment"),
        inArray(fileAttachments.targetId, paymentIds),
        inArray(fileAttachments.fileId, preferredFileIds)
      )
    );
  const existingKeys = new Set(
    existingPreferred.map((row) => `${row.targetId}:${row.fileId}`)
  );
  const preferredLinks = paymentIds.flatMap((paymentId) =>
    preferredFileIds
      .filter((fileId) => !existingKeys.has(`${paymentId}:${fileId}`))
      .map((fileId) => ({
        fileId,
        targetType: "print_payment" as const,
        targetId: paymentId,
        label: "invoice",
      }))
  );
  if (preferredLinks.length) {
    await db.insert(fileAttachments).values(preferredLinks);
  }

  const depositFiles = await db
    .select({ fileId: fileAttachments.fileId })
    .from(printQuotes)
    .innerJoin(
      fileAttachments,
      and(
        eq(fileAttachments.targetType, "print_quote"),
        eq(fileAttachments.targetId, printQuotes.id)
      )
    )
    .where(
      and(
        eq(printQuotes.runId, runId),
        eq(printQuotes.kind, "deposit_invoice"),
        eq(printQuotes.reviewStatus, "accepted")
      )
    );
  const fallbackFileIds = [
    ...new Set(
      depositFiles
        .map((row) => row.fileId)
        .filter((fileId) => !preferredFileIds.includes(fileId))
    ),
  ];
  if (!fallbackFileIds.length) return;

  await db
    .delete(fileAttachments)
    .where(
      and(
        eq(fileAttachments.targetType, "print_payment"),
        eq(fileAttachments.label, "invoice"),
        inArray(fileAttachments.targetId, paymentIds),
        inArray(fileAttachments.fileId, fallbackFileIds)
      )
    );
}

/** Backfill invoice links added before staged-payment file routing existed. */
export async function syncAcceptedInvoiceFiles(
  quoteId: string
): Promise<void> {
  const [quote] = await db
    .select({
      reviewStatus: printQuotes.reviewStatus,
      kind: printQuotes.kind,
      runId: printQuotes.runId,
      totalAmount: printQuotes.totalAmount,
      currency: printQuotes.currency,
    })
    .from(printQuotes)
    .where(eq(printQuotes.id, quoteId))
    .limit(1);
  if (!quote || quote.reviewStatus !== "accepted") return;

  const matchingKinds = invoiceFilePaymentKinds(quote.kind);
  if (!matchingKinds.length) return;
  const [quoteFiles, payments] = await Promise.all([
    db
      .select({ fileId: fileAttachments.fileId })
      .from(fileAttachments)
      .where(
        and(
          eq(fileAttachments.targetType, "print_quote"),
          eq(fileAttachments.targetId, quoteId)
        )
      ),
    db
      .select({ id: printPayments.id, quoteId: printPayments.quoteId, kind: printPayments.kind, amount: printPayments.amount, currency: printPayments.currency })
      .from(printPayments)
      .where(
        and(
          eq(printPayments.runId, quote.runId),
          inArray(printPayments.kind, matchingKinds)
        )
      ),
  ]);
  if (!quoteFiles.length || !payments.length) {
    await preferFinalInvoiceFiles(quote.runId);
    return;
  }

  const compatible = payments.filter(payment => payment.currency === quote.currency &&
    (payment.kind === "full" ? Number(payment.amount) === Number(quote.totalAmount) :
      payment.quoteId === quoteId || (quote.kind === "final_invoice" && payment.kind === "final")));
  const targetIds = compatible.map((payment) => payment.id);
  if (!targetIds.length) return;
  const existing = await db
    .select({
      fileId: fileAttachments.fileId,
      targetId: fileAttachments.targetId,
    })
    .from(fileAttachments)
    .where(
      and(
        eq(fileAttachments.targetType, "print_payment"),
        inArray(fileAttachments.targetId, targetIds)
      )
    );
  const existingKeys = new Set(
    existing.map((row) => `${row.targetId}:${row.fileId}`)
  );
  const links = compatible.flatMap((payment) =>
    quoteFiles
      .filter(
        (file) => !existingKeys.has(`${payment.id}:${file.fileId}`)
      )
      .map((file) => ({
        fileId: file.fileId,
        targetType: "print_payment" as const,
        targetId: payment.id,
        label: "invoice",
      }))
  );
  if (links.length) await db.insert(fileAttachments).values(links);
  await preferFinalInvoiceFiles(quote.runId);
}

/**
 * Detached auto-extraction for an invoice PDF that arrived on a matched printer
 * email thread. Auth-free and keyed by ids (runs inside `after()` from the email
 * cron). Backed by a `printExtractionJobs` row so it is idempotent per
 * (file, source message) and failures are visible + retryable in the print
 * manager. Creates a `suggested` quote for the manager to review, with review
 * flags for anything worth double-checking, and attaches the source file.
 */
export async function extractPrintInvoice(input: {
  fileId: string;
  runId: string;
  sourceThreadId?: string | null;
  sourceMessageId?: string | null;
}): Promise<SuggestedQuoteSaveResult | null> {
  const [run] = await db
    .select({
      id: printRuns.id,
      projectId: printRuns.projectId,
      contactId: printRuns.contactId,
    })
    .from(printRuns)
    .where(eq(printRuns.id, input.runId))
    .limit(1);
  if (!run) return null;

  const { job, isNew } = await getOrCreateExtractionJob({
    projectId: run.projectId,
    runId: run.id,
    kind: "pdf",
    fileId: input.fileId,
    sourceThreadId: input.sourceThreadId,
    sourceMessageId: input.sourceMessageId,
  });
  if (!isNew && job.status === "succeeded") {
    if (job.quoteId) {
      await syncAcceptedInvoiceFiles(job.quoteId);
      await revalidatePrintPaths(run.projectId);
    }
    return job.quoteId
      ? { id: job.quoteId, disposition: "unchanged" }
      : null;
  }
  await bumpJobAttempt(job.id);

  let parsed: ParsedPrinterQuote | null;
  try {
    parsed = await runPrintQuoteExtraction({
      fileId: input.fileId,
      projectId: run.projectId,
      runId: run.id,
    });
  } catch (err) {
    await markJobFailed(job.id, extractionErrorMessage(err));
    console.error("print invoice extraction failed:", err);
    return null;
  }
  if (!parsed) {
    await markJobFailed(job.id, "The file isn't ready or couldn't be read.");
    return null;
  }
  // A book interior, cover, or other artwork PDF yields no quantity, price,
  // total, or invoice number. Don't fabricate a suggested quote from it. The job
  // succeeded (it was read fine) so it isn't retried — it simply wasn't a quote.
  if (!hasFinancialSignal(parsed)) {
    await markJobSucceeded(job.id, null);
    return null;
  }

  const flags = selfCheckFlags(parsed, { rawIssueDate: parsed.issueDate });
  const saved = await upsertEmailSuggestedQuote(run, parsed, null, {
    sourceThreadId: input.sourceThreadId,
    sourceMessageId: input.sourceMessageId,
    reviewFlags: flags,
    extractionSource: "pdf_ai",
  });
  const [existingAttachment] = await db
    .select({ id: fileAttachments.id })
    .from(fileAttachments)
    .where(
      and(
        eq(fileAttachments.fileId, input.fileId),
        eq(fileAttachments.targetType, "print_quote"),
        eq(fileAttachments.targetId, saved.id)
      )
    )
    .limit(1);
  if (!existingAttachment) {
    await db.insert(fileAttachments).values({
      fileId: input.fileId,
      targetType: "print_quote",
      targetId: saved.id,
      label: "invoice",
    });
  }
  await syncAcceptedInvoiceFiles(saved.id);
  await markJobSucceeded(job.id, saved.id);
  await revalidatePrintPaths(run.projectId);
  return saved;
}
