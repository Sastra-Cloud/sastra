"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { printQuotes, printRuns, projects } from "@/lib/db/schema";
import { syncPrintEstimateToBudget } from "./budget-sync";
import {
  BUDGET_ESTIMATE_KIND,
  BUDGET_ESTIMATE_SOURCE_RUN_KINDS,
  canUseAsBudgetEstimate,
} from "./estimate-policy";
import { getPrintQuoteTotal } from "./quote-economics";
import { logActivity } from "@/lib/activity/log";
import { seedDefaultBudget } from "@/lib/budget/actions";
import { getOrCreateBudgetSettings } from "@/lib/budget/queries";

/**
 * Where a quote goes when it stops being the budget estimate. A print-run quote
 * returns to review; "active" would count as a reviewed price and take over the
 * budget. If a newer suggestion now holds its tier, that revision replaced it.
 */
async function releasedEstimateStatus(
  executor: Pick<typeof db, "select">,
  quote: Pick<
    typeof printQuotes.$inferSelect,
    "id" | "runId" | "quantityCps"
  >,
  runKind: string | undefined,
): Promise<"active" | "suggested" | "rejected"> {
  if (runKind === BUDGET_ESTIMATE_KIND) return "active";
  if (quote.quantityCps == null) return "suggested";
  const peers = await executor
    .select({ id: printQuotes.id, kind: printQuotes.kind })
    .from(printQuotes)
    .where(
      and(
        eq(printQuotes.runId, quote.runId),
        eq(printQuotes.reviewStatus, "suggested"),
        eq(printQuotes.quantityCps, quote.quantityCps),
      ),
    );
  // Mirrors print_quotes_suggested_tier_uq: quote and invoice share one slot.
  const slotTaken = peers.some(
    (peer) =>
      peer.id !== quote.id && ["quote", "invoice"].includes(peer.kind),
  );
  return slotTaken ? "rejected" : "suggested";
}

async function recordEstimateChange(input: {
  actorId: string;
  projectId: string;
  quoteId: string;
  summary: string;
}) {
  await syncPrintEstimateToBudget(input.projectId);
  await logActivity({
    actorId: input.actorId,
    projectId: input.projectId,
    entityType: "print",
    entityId: input.quoteId,
    action: "quote",
    summary: input.summary,
  });
  const [project] = await db
    .select({ slug: projects.slug })
    .from(projects)
    .where(eq(projects.id, input.projectId))
    .limit(1);
  if (project) {
    revalidatePath(`/projects/${project.slug}/budget`);
    revalidatePath(`/projects/${project.slug}/print`);
  }
}

/** Review confirms an estimate only: no order, payable, or production specs. */
export async function selectPrintEstimateQuote(
  quoteId: string,
  input?: {
    quantityCps: number;
    totalAmount: number;
    currency: string;
  },
): Promise<{ error?: string }> {
  const { user } = await requireRole("manager");
  const edits = input
    ? z
        .object({
          quantityCps: z.number().int().positive(),
          totalAmount: z.number().positive().max(999999999999),
          currency: z.string().regex(/^[A-Z]{3}$/),
        })
        .parse(input)
    : null;
  const result = await db.transaction(async (tx) => {
    const [quote] = await tx
      .select()
      .from(printQuotes)
      .where(eq(printQuotes.id, quoteId))
      .limit(1);
    if (!quote) return { error: "Quote not found." };
    // Serialize choices across all requests for this project.
    await tx
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, quote.projectId))
      .for("update");
    const [run] = await tx
      .select()
      .from(printRuns)
      .where(eq(printRuns.id, quote.runId))
      .limit(1);
    if (!run || !canUseAsBudgetEstimate(run, quote))
      return { error: "This quote cannot be used as a budget estimate." };
    const settings = await getOrCreateBudgetSettings(quote.projectId);
    if ((edits?.currency ?? quote.currency) !== settings.currency)
      return {
        error: `Use the budget currency (${settings.currency}). Convert and review the estimate total before selecting it; Sastra does not convert currencies.`,
      };
    if (!getPrintQuoteTotal(edits ? { ...quote, ...edits } : quote))
      return {
        error:
          "Review and enter a positive quote total or per-copy price first.",
      };
    const runs = await tx
      .select({ id: printRuns.id, kind: printRuns.kind })
      .from(printRuns)
      .where(
        and(
          eq(printRuns.projectId, quote.projectId),
          inArray(printRuns.kind, BUDGET_ESTIMATE_SOURCE_RUN_KINDS),
        ),
      );
    const previous = await tx
      .select({
        id: printQuotes.id,
        runId: printQuotes.runId,
        quantityCps: printQuotes.quantityCps,
      })
      .from(printQuotes)
      .where(
        and(
          inArray(
            printQuotes.runId,
            runs.map((r) => r.id),
          ),
          eq(printQuotes.reviewStatus, "estimated"),
          ne(printQuotes.id, quoteId),
        ),
      );
    for (const prior of previous) {
      const reviewStatus = await releasedEstimateStatus(
        tx,
        prior,
        runs.find((r) => r.id === prior.runId)?.kind,
      );
      await tx
        .update(printQuotes)
        .set({ reviewStatus, updatedAt: new Date() })
        .where(eq(printQuotes.id, prior.id));
    }
    await tx
      .update(printQuotes)
      .set({
        ...(edits
          ? {
              quantityCps: edits.quantityCps,
              totalAmount: edits.totalAmount.toFixed(2),
              currency: edits.currency,
            }
          : {}),
        reviewStatus: "estimated",
        acceptedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(printQuotes.id, quoteId));
    return { projectId: quote.projectId };
  });
  if ("error" in result) return result;
  await seedDefaultBudget(result.projectId);
  await recordEstimateChange({
    actorId: user.id,
    projectId: result.projectId,
    quoteId,
    summary: "Selected printer quote for budget estimate only",
  });
  return {};
}

/**
 * Stop using a print-run quote for the budget. The quote stays on the run for
 * review; rejecting it here would also discard it from the Print tab.
 */
export async function stopUsingPrintEstimateQuote(
  quoteId: string,
): Promise<{ error?: string }> {
  const { user } = await requireRole("manager");
  const result = await db.transaction(async (tx) => {
    const [quote] = await tx
      .select()
      .from(printQuotes)
      .where(eq(printQuotes.id, quoteId))
      .limit(1);
    if (!quote) return { error: "Quote not found." };
    await tx
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, quote.projectId))
      .for("update");
    const [run] = await tx
      .select({ kind: printRuns.kind })
      .from(printRuns)
      .where(eq(printRuns.id, quote.runId))
      .limit(1);
    if (quote.reviewStatus !== "estimated" || run?.kind !== "first_print")
      return { error: "This quote is not the selected budget estimate." };
    const reviewStatus = await releasedEstimateStatus(tx, quote, run.kind);
    await tx
      .update(printQuotes)
      .set({ reviewStatus, updatedAt: new Date() })
      .where(eq(printQuotes.id, quoteId));
    return { projectId: quote.projectId };
  });
  if ("error" in result) return result;
  await recordEstimateChange({
    actorId: user.id,
    projectId: result.projectId,
    quoteId,
    summary: "Stopped using printer quote for budget estimate",
  });
  return {};
}
