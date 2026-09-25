import "server-only";

import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { cache } from "react";

import { committedFundingTotal } from "@/lib/budget/compute";
import { db } from "@/lib/db";
import {
  budgetItems,
  fundingReceipts,
  mouPayments,
  sharedMouMemberships,
  sharedMouReceiptAllocations,
} from "@/lib/db/schema";
import type { ProjectFundingSummary } from "./print-funding";

export type ProjectFundingSummaryRow = ProjectFundingSummary & {
  projectId: string;
};

/** Read-only financial evidence for compact project funding summaries. */
export async function listProjectFundingSummaries(
  projectIds: string[]
): Promise<ProjectFundingSummaryRow[]> {
  if (projectIds.length === 0) return [];

  const [
    budgetRows,
    paymentRows,
    receiptRows,
    sharedRows,
    linkedPaymentReceipts,
    linkedSharedReceipts,
  ] = await Promise.all([
    db
      .select({
        projectId: budgetItems.projectId,
        needed: sql<number>`coalesce(sum(${budgetItems.amount}), 0)::float8`,
        lineSecured: sql<number>`coalesce(sum(${budgetItems.amountSecured}), 0)::float8`,
        spent: sql<number>`coalesce(sum(${budgetItems.amountSpent}), 0)::float8`,
        printNeeded: sql<number>`coalesce(sum(${budgetItems.amount}) filter (where ${budgetItems.category} = 'print_ship'), 0)::float8`,
        printSecured: sql<number>`coalesce(sum(${budgetItems.amountSecured}) filter (where ${budgetItems.category} = 'print_ship'), 0)::float8`,
        currency: sql<string>`coalesce(max(${budgetItems.currency}), 'USD')`,
      })
      .from(budgetItems)
      .where(inArray(budgetItems.projectId, projectIds))
      .groupBy(budgetItems.projectId),
    db
      .select({
        projectId: mouPayments.projectId,
        scheduled: sql<number>`coalesce(sum(${mouPayments.amount}), 0)::float8`,
        currency: sql<string>`coalesce(max(${mouPayments.currency}), 'USD')`,
      })
      .from(mouPayments)
      .where(
        and(
          inArray(mouPayments.projectId, projectIds),
          isNull(mouPayments.sharedMouGroupId)
        )
      )
      .groupBy(mouPayments.projectId),
    db
      .select({
        projectId: fundingReceipts.projectId,
        id: fundingReceipts.id,
        amount: fundingReceipts.amount,
        currency: fundingReceipts.currency,
      })
      .from(fundingReceipts)
      .where(inArray(fundingReceipts.projectId, projectIds)),
    db
      .select({
        projectId: sharedMouMemberships.projectId,
        committed: sql<number>`coalesce(sum(${sharedMouMemberships.allocationAmount}), 0)::float8`,
      })
      .from(sharedMouMemberships)
      .where(
        and(
          inArray(sharedMouMemberships.projectId, projectIds),
          eq(sharedMouMemberships.active, true)
        )
      )
      .groupBy(sharedMouMemberships.projectId),
    db
      .select({ receiptId: mouPayments.receiptId })
      .from(mouPayments)
      .where(
        and(
          inArray(mouPayments.projectId, projectIds),
          isNotNull(mouPayments.receiptId)
        )
      ),
    db
      .select({ receiptId: sharedMouReceiptAllocations.fundingReceiptId })
      .from(sharedMouReceiptAllocations)
      .innerJoin(
        fundingReceipts,
        eq(
          fundingReceipts.id,
          sharedMouReceiptAllocations.fundingReceiptId
        )
      )
      .where(inArray(fundingReceipts.projectId, projectIds)),
  ]);

  const budgetMap = new Map(budgetRows.map((row) => [row.projectId, row]));
  const paymentMap = new Map(paymentRows.map((row) => [row.projectId, row]));
  const linkedReceiptIds = new Set([
    ...linkedPaymentReceipts.map((row) => row.receiptId),
    ...linkedSharedReceipts.map((row) => row.receiptId),
  ]);
  const receiptMap = new Map<
    string,
    { received: number; standaloneReceived: number; currency: string }
  >();
  for (const row of receiptRows) {
    const current = receiptMap.get(row.projectId) ?? {
      received: 0,
      standaloneReceived: 0,
      currency: row.currency,
    };
    const amount = Number(row.amount);
    current.received += amount;
    if (!linkedReceiptIds.has(row.id)) current.standaloneReceived += amount;
    receiptMap.set(row.projectId, current);
  }
  const sharedMap = new Map(sharedRows.map((row) => [row.projectId, row]));

  return projectIds.map((projectId) => {
    const budget = budgetMap.get(projectId);
    const payments = paymentMap.get(projectId);
    const receipts = receiptMap.get(projectId);
    const shared = sharedMap.get(projectId);
    return {
      projectId,
      needed: budget?.needed ?? 0,
      committed: committedFundingTotal(
        budget?.lineSecured ?? 0,
        (payments?.scheduled ?? 0) + (shared?.committed ?? 0),
        receipts?.standaloneReceived ?? 0
      ),
      received: receipts?.received ?? 0,
      spent: budget?.spent ?? 0,
      printNeeded: budget?.printNeeded ?? 0,
      printSecured: budget?.printSecured ?? 0,
      currency:
        budget?.currency ?? payments?.currency ?? receipts?.currency ?? "USD",
    };
  });
}

export const getProjectFundingSummary = cache(
  async function getProjectFundingSummary(projectId: string) {
    const [summary] = await listProjectFundingSummaries([projectId]);
    return summary ?? null;
  }
);
