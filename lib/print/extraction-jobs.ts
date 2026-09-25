import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { printExtractionJobs } from "@/lib/db/schema";

export type ExtractionJobKind = "pdf" | "email_text";
export type ExtractionJobRow = typeof printExtractionJobs.$inferSelect;

export function extractionErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.slice(0, 2000);
}

/**
 * Find or create the extraction job for a source. Idempotency key is
 * (kind, sourceMessageId, fileId): a PDF invoice is keyed by its file + message;
 * an email-text extraction by its message. Callers without a source message
 * (manual paste) skip the job entirely. Returns whether the row was just created
 * so callers can short-circuit an already-succeeded job.
 */
export async function getOrCreateExtractionJob(input: {
  projectId: string;
  runId: string | null;
  kind: ExtractionJobKind;
  fileId?: string | null;
  sourceThreadId?: string | null;
  sourceMessageId?: string | null;
}): Promise<{ job: ExtractionJobRow; isNew: boolean }> {
  const conds = [eq(printExtractionJobs.kind, input.kind)];
  if (input.sourceMessageId) {
    conds.push(eq(printExtractionJobs.sourceMessageId, input.sourceMessageId));
  } else {
    conds.push(sql`${printExtractionJobs.sourceMessageId} is null`);
  }
  if (input.fileId) {
    conds.push(eq(printExtractionJobs.fileId, input.fileId));
  } else {
    conds.push(sql`${printExtractionJobs.fileId} is null`);
  }

  const [existing] = await db
    .select()
    .from(printExtractionJobs)
    .where(and(...conds))
    .limit(1);
  if (existing) return { job: existing, isNew: false };

  const [created] = await db
    .insert(printExtractionJobs)
    .values({
      projectId: input.projectId,
      runId: input.runId,
      kind: input.kind,
      fileId: input.fileId ?? null,
      sourceThreadId: input.sourceThreadId ?? null,
      sourceMessageId: input.sourceMessageId ?? null,
      status: "pending",
      attempts: 0,
    })
    .returning();
  return { job: created, isNew: true };
}

export async function bumpJobAttempt(jobId: string): Promise<void> {
  await db
    .update(printExtractionJobs)
    .set({
      attempts: sql`${printExtractionJobs.attempts} + 1`,
      status: "pending",
      updatedAt: new Date(),
    })
    .where(eq(printExtractionJobs.id, jobId));
}

export async function markJobSucceeded(
  jobId: string,
  quoteId: string | null
): Promise<void> {
  await db
    .update(printExtractionJobs)
    .set({ status: "succeeded", error: null, quoteId, updatedAt: new Date() })
    .where(eq(printExtractionJobs.id, jobId));
}

export async function markJobFailed(jobId: string, error: string): Promise<void> {
  await db
    .update(printExtractionJobs)
    .set({ status: "failed", error, updatedAt: new Date() })
    .where(eq(printExtractionJobs.id, jobId));
}
