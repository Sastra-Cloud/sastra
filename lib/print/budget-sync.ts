import "server-only";

import { and, asc, eq, isNull, ne } from "drizzle-orm";

import { db } from "@/lib/db";
import { budgetItems, printQuotes, printRuns } from "@/lib/db/schema";
import { chooseEstimateQuote } from "@/lib/print/estimate";
import { getPrintQuoteTotal } from "@/lib/print/quote-economics";
import { syncBudgetApprovalState } from "@/lib/budget/approval-service";

/**
 * Keep the project-level Print / Ship budget line in step with the primary
 * (first_print) run's chosen copy-tier quote.
 *
 * The book PRODUCTION budget (translation/editing/typesetting…) is driven by the
 * English word count; the PRINT cost is a SEPARATE concern driven by how many
 * copies × the printer quote. This line moves estimate → "finalized" once a
 * quote is accepted; actual spend fills in from paid payments
 * (`syncPrintSpentToBudget`). Reprints keep their own run-scoped line
 * (`syncAcceptedQuoteToRunBudget`). Lives in its own module (not the
 * "use server" actions file) so the quote-extraction pipeline can call it too.
 */
export async function syncPrintEstimateToBudget(projectId: string) {
  const [run] = await db
    .select()
    .from(printRuns)
    .where(
      and(eq(printRuns.projectId, projectId), eq(printRuns.kind, "first_print"))
    )
    .orderBy(asc(printRuns.createdAt))
    .limit(1);

  const [existing] = await db
    .select({ id: budgetItems.id })
    .from(budgetItems)
    .where(
      and(
        eq(budgetItems.projectId, projectId),
        eq(budgetItems.category, "print_ship"),
        isNull(budgetItems.printRunId)
      )
    )
    .limit(1);

  // No primary print run → no project-level print cost line.
  if (!run) {
    if (existing)
      await db.delete(budgetItems).where(eq(budgetItems.id, existing.id));
    await syncBudgetApprovalState(projectId);
    return;
  }

  const quotes = await db
    .select()
    .from(printQuotes)
    .where(
      and(eq(printQuotes.runId, run.id), ne(printQuotes.reviewStatus, "rejected"))
    );
  const chosen = chooseEstimateQuote(quotes, run.quantityTarget);

  const copies = chosen?.quantityCps ?? run.quantityTarget ?? null;
  const state =
    chosen?.reviewStatus === "accepted"
      ? "finalized"
      : chosen
        ? "estimate"
        : "awaiting quote";
  const label = `Printing — ${
    copies ? `${copies.toLocaleString()} copies` : "print run"
  } (${state})`;
  // Use the effective total (quoted total, or quantity × per-copy price) so a
  // quote priced only per copy still lands a real amount, not $0.
  const total = chosen
    ? (getPrintQuoteTotal(chosen)?.totalCost ?? 0).toFixed(2)
    : "0.00";
  const currency = chosen?.currency ?? run.fundingCurrency ?? "USD";

  // Update estimate fields only — preserve Raised/Spent (amountSecured/amountSpent).
  const values = {
    label,
    group: "book_publishing" as const,
    category: "print_ship" as const,
    unit: "flat" as const,
    quantity: "1",
    unitPrice: total,
    amount: total,
    isAutoQuantity: false,
    currency,
    updatedAt: new Date(),
  };
  if (existing) {
    await db
      .update(budgetItems)
      .set(values)
      .where(eq(budgetItems.id, existing.id));
  } else {
    await db
      .insert(budgetItems)
      .values({ projectId, printRunId: null, sortOrder: 6, ...values });
  }
  await syncBudgetApprovalState(projectId);
}

/**
 * Create or refresh the run-scoped Print / Ship line for an accepted reprint
 * quote. Returning the canonical row lets the Budget UI replace a temporary
 * optimistic line without waiting for a route refresh.
 */
export async function syncAcceptedQuoteToRunBudget(
  quote: typeof printQuotes.$inferSelect
) {
  const effectiveTotal = getPrintQuoteTotal(quote)?.totalCost ?? 0;
  if (effectiveTotal <= 0) return null;

  const [run] = await db
    .select({
      kind: printRuns.kind,
      printNumber: printRuns.printNumber,
    })
    .from(printRuns)
    .where(eq(printRuns.id, quote.runId))
    .limit(1);
  if (run?.kind !== "reprint") return null;

  const label = `Reprint ${run.printNumber ?? ""} print / ship`.replace(
    "  ",
    " "
  );
  const [existing] = await db
    .select({ id: budgetItems.id })
    .from(budgetItems)
    .where(
      and(
        eq(budgetItems.projectId, quote.projectId),
        eq(budgetItems.printRunId, quote.runId),
        eq(budgetItems.category, "print_ship")
      )
    )
    .limit(1);
  const values = {
    label,
    group: "book_publishing" as const,
    category: "print_ship" as const,
    unit: "flat" as const,
    quantity: "1",
    unitPrice: effectiveTotal.toFixed(2),
    amount: effectiveTotal.toFixed(2),
    isAutoQuantity: false,
    currency: quote.currency,
    updatedAt: new Date(),
  };

  if (existing) {
    const [line] = await db
      .update(budgetItems)
      .set(values)
      .where(eq(budgetItems.id, existing.id))
      .returning();
    await syncBudgetApprovalState(quote.projectId, quote.runId);
    return line ?? null;
  }

  const [line] = await db
    .insert(budgetItems)
    .values({
      projectId: quote.projectId,
      printRunId: quote.runId,
      sortOrder: 10,
      ...values,
    })
    .returning();
  await syncBudgetApprovalState(quote.projectId, quote.runId);
  return line ?? null;
}
