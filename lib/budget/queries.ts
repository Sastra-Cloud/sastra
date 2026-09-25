import "server-only";

import { and, asc, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  budgetItems,
  budgetScopePresentations,
  fundingReceipts,
  invoices,
  mouPayments,
  projectBudgetSettings,
  royaltyPayments,
  user,
} from "@/lib/db/schema";
import { getWorkspaceSettings } from "@/lib/workspace/queries";

export type RoyaltyPaymentRow = {
  id: string;
  period: string;
  amount: string;
  currency: string;
  dueDate: string | null;
  recipientEmail: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  taskId: string | null;
  paidAt: Date | null;
};

/** Recurring royalty payments for a project, newest due date first. */
export async function listRoyaltyPayments(
  projectId: string
): Promise<RoyaltyPaymentRow[]> {
  return db
    .select({
      id: royaltyPayments.id,
      period: royaltyPayments.period,
      amount: royaltyPayments.amount,
      currency: royaltyPayments.currency,
      dueDate: royaltyPayments.dueDate,
      recipientEmail: royaltyPayments.recipientEmail,
      assigneeId: royaltyPayments.assigneeId,
      assigneeName: user.name,
      taskId: royaltyPayments.taskId,
      paidAt: royaltyPayments.paidAt,
    })
    .from(royaltyPayments)
    .leftJoin(user, eq(user.id, royaltyPayments.assigneeId))
    .where(eq(royaltyPayments.projectId, projectId))
    .orderBy(desc(royaltyPayments.dueDate));
}

export type BudgetLine = typeof budgetItems.$inferSelect;
export type BudgetSettings = typeof projectBudgetSettings.$inferSelect;
export type BudgetPresentation = typeof budgetScopePresentations.$inferSelect;
export type FundingReceipt = typeof fundingReceipts.$inferSelect;
export type MouPayment = typeof mouPayments.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;

/** Funding/payments actually received for a project, newest first. */
export async function listReceipts(
  projectId: string,
  printRunId?: string,
  includeAll = false
): Promise<FundingReceipt[]> {
  return db
    .select()
    .from(fundingReceipts)
    .where(
      includeAll
        ? eq(fundingReceipts.projectId, projectId)
        : printRunId
        ? and(
            eq(fundingReceipts.projectId, projectId),
            eq(fundingReceipts.printRunId, printRunId)
          )
        : and(
            eq(fundingReceipts.projectId, projectId),
            isNull(fundingReceipts.printRunId)
          )
    )
    .orderBy(desc(fundingReceipts.receivedDate), desc(fundingReceipts.createdAt));
}

/** Scheduled incoming MoU payments for a project, by expected date. */
export async function listPayments(
  projectId: string,
  printRunId?: string,
  includeAll = false
): Promise<MouPayment[]> {
  return db
    .select()
    .from(mouPayments)
    .where(
      includeAll
        ? and(
            eq(mouPayments.projectId, projectId),
            isNull(mouPayments.sharedMouGroupId)
          )
        : printRunId
        ? and(
            eq(mouPayments.projectId, projectId),
            eq(mouPayments.printRunId, printRunId),
            isNull(mouPayments.sharedMouGroupId)
          )
        : and(
            eq(mouPayments.projectId, projectId),
            isNull(mouPayments.printRunId),
            isNull(mouPayments.sharedMouGroupId)
          )
    )
    .orderBy(asc(mouPayments.dueDate), asc(mouPayments.createdAt));
}

/** Generated invoices for a project, newest first. */
export async function listInvoices(
  projectId: string,
  printRunId?: string,
  includeAll = false
): Promise<Invoice[]> {
  return db
    .select()
    .from(invoices)
    .where(
      includeAll
        ? eq(invoices.projectId, projectId)
        : printRunId
        ? and(eq(invoices.projectId, projectId), eq(invoices.printRunId, printRunId))
        : and(eq(invoices.projectId, projectId), isNull(invoices.printRunId))
    )
    .orderBy(desc(invoices.createdAt));
}

/** Per-project quotation settings (created with defaults on first access). */
export async function getOrCreateBudgetSettings(
  projectId: string
): Promise<BudgetSettings> {
  const [existing] = await db
    .select()
    .from(projectBudgetSettings)
    .where(eq(projectBudgetSettings.projectId, projectId))
    .limit(1);
  if (existing) return existing;

  const workspace = await getWorkspaceSettings();
  await db
    .insert(projectBudgetSettings)
    .values({
      projectId,
      wordsPerPage: workspace.wordsPerPage,
      currency: workspace.defaultCurrency,
      rateTranslation: workspace.rateTranslation,
      rateProofreading: workspace.rateProofreading,
      rateEditing: workspace.rateEditing,
      rateCoverDesign: workspace.rateCoverDesign,
      rateTypesetting: workspace.rateTypesetting,
      rateProjectManagement: workspace.rateProjectManagement,
      ratePrintShip: workspace.ratePrintShip,
      rateAudiobook: workspace.rateAudiobook,
      rateVideoSeries: workspace.rateVideoSeries,
    })
    .onConflictDoNothing({ target: projectBudgetSettings.projectId });

  const [row] = await db
    .select()
    .from(projectBudgetSettings)
    .where(eq(projectBudgetSettings.projectId, projectId))
    .limit(1);
  return row;
}

/** All quotation lines for a project, in group + sort order. */
export async function getProjectBudget(
  projectId: string,
  printRunId?: string,
  includeAll = false
): Promise<BudgetLine[]> {
  return db
    .select()
    .from(budgetItems)
    .where(
      includeAll
        ? eq(budgetItems.projectId, projectId)
        : printRunId
        ? and(
            eq(budgetItems.projectId, projectId),
            eq(budgetItems.printRunId, printRunId)
          )
        : and(eq(budgetItems.projectId, projectId), isNull(budgetItems.printRunId))
    )
    .orderBy(asc(budgetItems.group), asc(budgetItems.sortOrder), asc(budgetItems.createdAt));
}

/** Partner quotation settings for a main-project or reprint budget scope. */
export async function getBudgetPresentation(
  projectId: string,
  printRunId?: string
): Promise<BudgetPresentation | null> {
  const [row] = await db
    .select()
    .from(budgetScopePresentations)
    .where(
      printRunId
        ? and(
            eq(budgetScopePresentations.projectId, projectId),
            eq(budgetScopePresentations.printRunId, printRunId)
          )
        : and(
            eq(budgetScopePresentations.projectId, projectId),
            isNull(budgetScopePresentations.printRunId)
          )
    )
    .limit(1);
  return row ?? null;
}

/** Settings + lines together (settings always exist after this call). */
export async function getBudgetData(
  projectId: string,
  printRunId?: string,
  includeAll = false
) {
  const [settings, items, presentation] = await Promise.all([
    getOrCreateBudgetSettings(projectId),
    getProjectBudget(projectId, printRunId, includeAll),
    includeAll ? Promise.resolve(null) : getBudgetPresentation(projectId, printRunId),
  ]);
  return { settings, items, presentation };
}
