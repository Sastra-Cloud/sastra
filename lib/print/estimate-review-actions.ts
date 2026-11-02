"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { printQuotes, printRuns, projects } from "@/lib/db/schema";
import { syncPrintEstimateToBudget } from "./budget-sync";
import { BUDGET_ESTIMATE_KIND } from "./estimate-policy";
import { getPrintQuoteTotal } from "./quote-economics";
import { logActivity } from "@/lib/activity/log";
import { seedDefaultBudget } from "@/lib/budget/actions";
import { getOrCreateBudgetSettings } from "@/lib/budget/queries";

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
    if (run?.kind !== BUDGET_ESTIMATE_KIND || run.status === "cancelled")
      return { error: "This is not a budget estimate request." };
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
      .select({ id: printRuns.id })
      .from(printRuns)
      .where(
        and(
          eq(printRuns.projectId, quote.projectId),
          eq(printRuns.kind, BUDGET_ESTIMATE_KIND),
        ),
      );
    await tx
      .update(printQuotes)
      .set({ reviewStatus: "active", updatedAt: new Date() })
      .where(
        and(
          inArray(
            printQuotes.runId,
            runs.map((r) => r.id),
          ),
          eq(printQuotes.reviewStatus, "estimated"),
        ),
      );
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
  await syncPrintEstimateToBudget(result.projectId);
  await logActivity({
    actorId: user.id,
    projectId: result.projectId,
    entityType: "print",
    entityId: quoteId,
    action: "quote",
    summary: "Selected printer quote for budget estimate only",
  });
  const [project] = await db
    .select({ slug: projects.slug })
    .from(projects)
    .where(eq(projects.id, result.projectId))
    .limit(1);
  if (project) {
    revalidatePath(`/projects/${project.slug}/budget`);
    revalidatePath(`/projects/${project.slug}/print`);
  }
  return {};
}
