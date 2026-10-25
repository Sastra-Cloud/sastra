"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { requireRole } from "@/lib/auth/guards";
import { logActivity } from "@/lib/activity/log";
import { scheduleHealthRecompute } from "@/lib/blockers/engine";
import { db } from "@/lib/db";
import { documentImports, printQuotes } from "@/lib/db/schema";
import { syncPrintEstimateToBudget } from "@/lib/print/budget-sync";

const reviewInput = z.object({ threadId: z.string().uuid(), id: z.string().uuid() });

function refreshReview(threadId: string) {
  // Refresh the shared queue and layout-owned badge in the action response.
  revalidatePath("/", "layout");
  revalidatePath(`/correspondence/${threadId}`);
}

/** Dismissing an unused suggestion must never reverse an accepted commitment. */
export async function dismissEmailQuoteSuggestion(input: { threadId: string; id: string }) {
  const { user } = await requireRole("manager");
  const { threadId, id } = reviewInput.parse(input);
  const [quote] = await db.update(printQuotes)
    .set({ reviewStatus: "rejected", updatedAt: new Date() })
    .where(and(eq(printQuotes.id, id), eq(printQuotes.sourceThreadId, threadId), eq(printQuotes.reviewStatus, "suggested")))
    .returning({ id: printQuotes.id, projectId: printQuotes.projectId });
  if (!quote) return { error: "This quote has changed. Refresh the email before reviewing it again." };
  await syncPrintEstimateToBudget(quote.projectId);
  await logActivity({ actorId: user.id, projectId: quote.projectId, entityType: "print", entityId: id, action: "quote", summary: "Dismissed email printer quote suggestion" });
  scheduleHealthRecompute(quote.projectId);
  refreshReview(threadId);
  return {};
}

/** Discard only an unapproved source review, keeping its file and approved records. */
export async function dismissEmailFundingReview(input: { threadId: string; id: string }) {
  await requireRole("manager");
  const { threadId, id } = reviewInput.parse(input);
  const [review] = await db.update(documentImports)
    .set({ status: "discarded", updatedAt: new Date() })
    .where(and(eq(documentImports.id, id), eq(documentImports.sourceThreadId, threadId), inArray(documentImports.status, ["extracted", "failed"])))
    .returning({ id: documentImports.id });
  if (!review) return { error: "This funding review has changed. Refresh the email before reviewing it again." };
  refreshReview(threadId);
  return {};
}
