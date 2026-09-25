import "server-only";

import { desc, eq, inArray } from "drizzle-orm";

import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { emailSignalLessons } from "@/lib/db/schema";

export type EmailSignalLessonRow = {
  id: string;
  lesson: string;
  status: string;
  confidence: number | null;
  evidenceCount: number;
  evidenceRefs: string[];
  reflectionAt: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Candidate + approved intake negative lessons for the admin learning card.
 * Admin-only: it is only rendered on the AI settings page. `rejected`/`retired`
 * rows are excluded — they are terminal and shouldn't clutter the review UI.
 */
export async function listEmailSignalLessons(): Promise<EmailSignalLessonRow[]> {
  await requireRole("admin");
  const rows = await db
    .select()
    .from(emailSignalLessons)
    .where(inArray(emailSignalLessons.status, ["candidate", "approved"]))
    .orderBy(desc(emailSignalLessons.createdAt));
  return rows.map((row) => ({
    id: row.id,
    lesson: row.lesson,
    status: row.status,
    confidence: row.confidence,
    evidenceCount: row.evidenceCount,
    evidenceRefs: row.evidenceRefs,
    reflectionAt: row.reflectionAt?.toISOString() ?? null,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

/**
 * The approved negative-lesson texts, injected into the intake system prompt.
 * Intentionally unguarded (no role check): it runs inside the workspace intake
 * pipeline, not on behalf of a signed-in user. Only `approved` rows are ever
 * returned, so nothing reaches the model without an admin's explicit approval.
 */
export async function loadApprovedEmailSignalLessons(): Promise<string[]> {
  const rows = await db
    .select({ lesson: emailSignalLessons.lesson })
    .from(emailSignalLessons)
    .where(eq(emailSignalLessons.status, "approved"))
    .orderBy(desc(emailSignalLessons.createdAt));
  return rows.map((row) => row.lesson);
}
