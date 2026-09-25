import "server-only";

import { and, eq, isNotNull } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  budgetItems,
  fundingReceipts,
  licenseFeePayments,
  printPayments,
  royaltyPayments,
} from "@/lib/db/schema";
import {
  computeCashflow,
  reconcileLines,
  toCents,
  type CashflowMonth,
  type ReconRow,
} from "./reconcile-math";

export type BudgetReconciliation = {
  rows: ReconRow[];
  /** Rows where recorded ≠ manual by at least one cent. */
  mismatches: ReconRow[];
  /**
   * Paid outflows with no quotation line to land on: royalties and license fees
   * always; print payments only when the quotation has no `print_ship` line.
   */
  offQuotationCents: { royalties: number; licenseFees: number; print: number };
  cashflow: CashflowMonth[];
  totals: { inCents: number; outCents: number };
};

/**
 * Derive-first reconciliation: compare each mappable quotation line's manual
 * "Spent" against recorded paid payments, and build the project's monthly
 * cash-flow (receipts in vs paid payments out). Nothing is written — the panel
 * offers an explicit "Adopt recorded" per mismatch.
 */
export async function getBudgetReconciliation(
  projectId: string
): Promise<BudgetReconciliation> {
  const [items, paidPrint, paidRoyalties, paidLicenseFees, receipts] =
    await Promise.all([
      db
        .select({
          id: budgetItems.id,
          category: budgetItems.category,
          label: budgetItems.label,
          currency: budgetItems.currency,
          amountSpent: budgetItems.amountSpent,
        })
        .from(budgetItems)
        .where(eq(budgetItems.projectId, projectId)),
      db
        .select({
          amount: printPayments.amount,
          currency: printPayments.currency,
          paidAt: printPayments.paidAt,
        })
        .from(printPayments)
        .where(
          and(eq(printPayments.projectId, projectId), isNotNull(printPayments.paidAt))
        ),
      db
        .select({
          amount: royaltyPayments.amount,
          currency: royaltyPayments.currency,
          paidAt: royaltyPayments.paidAt,
        })
        .from(royaltyPayments)
        .where(
          and(
            eq(royaltyPayments.projectId, projectId),
            isNotNull(royaltyPayments.paidAt)
          )
        ),
      db
        .select({
          amount: licenseFeePayments.amount,
          currency: licenseFeePayments.currency,
          paidAt: licenseFeePayments.paidAt,
        })
        .from(licenseFeePayments)
        .where(
          and(
            eq(licenseFeePayments.projectId, projectId),
            isNotNull(licenseFeePayments.paidAt)
          )
        ),
      db
        .select({
          amount: fundingReceipts.amount,
          expectedNetAmount: fundingReceipts.expectedNetAmount,
          actualNetAmount: fundingReceipts.actualNetAmount,
          receivedDate: fundingReceipts.receivedDate,
        })
        .from(fundingReceipts)
        .where(eq(fundingReceipts.projectId, projectId)),
    ]);

  const rows = reconcileLines({
    items,
    paymentsByCategory: { print_ship: paidPrint },
  });
  const mismatches = rows.filter((r) => r.varianceCents !== 0);

  const hasPrintLine = items.some((i) => i.category === "print_ship");
  const offQuotationCents = {
    royalties: paidRoyalties.reduce((s, p) => s + toCents(p.amount), 0),
    licenseFees: paidLicenseFees.reduce((s, p) => s + toCents(p.amount), 0),
    print: hasPrintLine
      ? 0
      : paidPrint.reduce((s, p) => s + toCents(p.amount), 0),
  };

  const outflowEvents = [
    ...paidPrint.map((p) => ({ amount: p.amount, date: p.paidAt })),
    ...paidRoyalties.map((p) => ({ amount: p.amount, date: p.paidAt })),
    ...paidLicenseFees.map((p) => ({ amount: p.amount, date: p.paidAt })),
  ];
  const cashflow = computeCashflow({
    inflows: receipts.map((r) => ({
      amount: r.actualNetAmount ?? r.expectedNetAmount ?? r.amount,
      date: r.receivedDate,
    })),
    outflows: outflowEvents,
  });
  const totals = {
    inCents: cashflow.reduce((s, m) => s + m.inCents, 0),
    outCents: cashflow.reduce((s, m) => s + m.outCents, 0),
  };

  return { rows, mismatches, offQuotationCents, cashflow, totals };
}
