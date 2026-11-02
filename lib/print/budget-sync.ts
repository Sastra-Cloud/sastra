import "server-only";

import { and, asc, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { budgetItems, printQuotes, printRuns, projects } from "@/lib/db/schema";
import {
  chooseBudgetPrintQuote,
  BUDGET_ESTIMATE_KIND,
} from "@/lib/print/estimate-policy";
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
  // All sync callers serialize with estimate selection. Each writer reads the
  // latest decision under this lock, so a slow extraction cannot restore an old price.
  await db.transaction(async (tx) => {
    await tx
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .for("update");
    await writePrintEstimateToBudget(projectId, tx);
  });
  await syncBudgetApprovalState(projectId);
}

async function writePrintEstimateToBudget(
  projectId: string,
  executor: Pick<typeof db, "select" | "update" | "insert">,
) {
  const runs = await executor
    .select()
    .from(printRuns)
    .where(eq(printRuns.projectId, projectId))
    .orderBy(asc(printRuns.createdAt));
  const quotes = await executor
    .select()
    .from(printQuotes)
    .where(eq(printQuotes.projectId, projectId))
    .orderBy(desc(printQuotes.updatedAt));
  const chosen = chooseBudgetPrintQuote(runs, quotes);
  const run =
    runs.find((r) => r.id === chosen?.runId) ??
    runs.find((r) => r.kind === "first_print" && r.status !== "cancelled");
  const [existing] = await executor
    .select()
    .from(budgetItems)
    .where(
      and(
        eq(budgetItems.projectId, projectId),
        eq(budgetItems.category, "print_ship"),
        isNull(budgetItems.printRunId),
      ),
    )
    .limit(1);

  // Preserve a manual budget line when there is no printer evidence to sync.
  if (!run) {
    if (existing?.label.startsWith("Printing —")) {
      await executor
        .update(budgetItems)
        .set({
          label: "Printing — print run (awaiting quote)",
          amount: "0.00",
          unitPrice: "0.00",
          updatedAt: new Date(),
        })
        .where(eq(budgetItems.id, existing.id));
    }
    return;
  }

  const copies = chosen?.quantityCps ?? run.quantityTarget ?? null;
  const state =
    run.kind !== BUDGET_ESTIMATE_KIND && chosen?.reviewStatus === "accepted"
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
    await executor
      .update(budgetItems)
      .set(values)
      .where(eq(budgetItems.id, existing.id));
  } else {
    await executor
      .insert(budgetItems)
      .values({ projectId, printRunId: null, sortOrder: 6, ...values });
  }
}

/**
 * Create or refresh the run-scoped Print / Ship line for an accepted reprint
 * quote. Returning the canonical row lets the Budget UI replace a temporary
 * optimistic line without waiting for a route refresh.
 */
export async function syncAcceptedQuoteToRunBudget(
  quote: typeof printQuotes.$inferSelect,
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
    " ",
  );
  const [existing] = await db
    .select({ id: budgetItems.id })
    .from(budgetItems)
    .where(
      and(
        eq(budgetItems.projectId, quote.projectId),
        eq(budgetItems.printRunId, quote.runId),
        eq(budgetItems.category, "print_ship"),
      ),
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
