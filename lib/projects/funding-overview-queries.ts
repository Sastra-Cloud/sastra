import "server-only";
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";

import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { budgetItems, donationAllocations, fundingReceipts, mouPayments, projectBudgetSettings, projectPartnerQuotations, proposalSubmissions, sharedMouGroups, sharedMouMemberships, sharedMouReceiptAllocations, sharedMouReceipts } from "@/lib/db/schema";
import { getWorkspaceSettings } from "@/lib/workspace/queries";
import { buildProjectFundingOverview } from "./funding-overview";

/** Workspace finance roles only. This is the main project budget; reprints remain separate. */
export async function getProjectFundingOverview(projectId: string) {
  await requireRole("manager");
  const [costs, payments, receipts, agreements, allocations, donations, settings, donationPromises] = await Promise.all([
    db.select({ amount: budgetItems.amount, amountSecured: budgetItems.amountSecured, amountSpent: budgetItems.amountSpent, currency: budgetItems.currency }).from(budgetItems).where(and(eq(budgetItems.projectId, projectId), isNull(budgetItems.printRunId))),
    db.select({ id: mouPayments.id, amount: mouPayments.amount, currency: mouPayments.currency, receiptId: mouPayments.receiptId, paidAt: mouPayments.paidAt, dueDate: mouPayments.dueDate, publicDescription: mouPayments.publicDescription, notes: mouPayments.notes, trigger: mouPayments.trigger, fundingBasis: mouPayments.fundingBasis, partnerName: mouPayments.partnerName }).from(mouPayments).where(and(eq(mouPayments.projectId, projectId), isNull(mouPayments.printRunId), isNull(mouPayments.sharedMouGroupId))),
    db.select({ id: fundingReceipts.id, amount: fundingReceipts.amount, currency: fundingReceipts.currency, expectedNetAmount: fundingReceipts.expectedNetAmount, actualNetAmount: fundingReceipts.actualNetAmount, source: fundingReceipts.source, receivedDate: fundingReceipts.receivedDate, proposalId: fundingReceipts.proposalId }).from(fundingReceipts).where(and(eq(fundingReceipts.projectId, projectId), isNull(fundingReceipts.printRunId))).orderBy(desc(fundingReceipts.receivedDate)),
    db.select({ id: sharedMouGroups.id, name: sharedMouGroups.name, counterparty: sharedMouGroups.counterparty, reviewRequired: sharedMouGroups.reviewRequired, currency: sharedMouGroups.currency, allocationAmount: sharedMouMemberships.allocationAmount }).from(sharedMouMemberships).innerJoin(sharedMouGroups, eq(sharedMouGroups.id, sharedMouMemberships.groupId)).where(and(eq(sharedMouMemberships.projectId, projectId), eq(sharedMouMemberships.active, true))),
    db.select({ receiptId: sharedMouReceiptAllocations.fundingReceiptId, groupId: sharedMouReceipts.groupId }).from(sharedMouReceiptAllocations).innerJoin(sharedMouReceipts, eq(sharedMouReceipts.id, sharedMouReceiptAllocations.receiptId)).where(eq(sharedMouReceiptAllocations.projectId, projectId)),
    db.select({ receiptId: donationAllocations.fundingReceiptId }).from(donationAllocations).where(eq(donationAllocations.projectId, projectId)),
    db.select({ currency: projectBudgetSettings.currency, partnerName: projectBudgetSettings.partnerName }).from(projectBudgetSettings).where(eq(projectBudgetSettings.projectId, projectId)).limit(1),
    db.select({ id: proposalSubmissions.id, agreedAmount: sql<string>`${proposalSubmissions.agreedAmount}`, currency: proposalSubmissions.currency,
      partnerName: sql<string>`coalesce(nullif(${proposalSubmissions.partnerName}, ''), nullif(${projectPartnerQuotations.partnerName}, ''), ${proposalSubmissions.recipientName}, ${proposalSubmissions.recipientEmail})` })
      .from(proposalSubmissions).leftJoin(projectPartnerQuotations, eq(projectPartnerQuotations.id, proposalSubmissions.partnerQuotationId))
      .where(and(eq(proposalSubmissions.projectId, projectId), isNull(proposalSubmissions.printRunId), eq(proposalSubmissions.status, "accepted"), eq(proposalSubmissions.fundingPath, "donation"), isNotNull(proposalSubmissions.agreedAmount))),
  ]);
  const currency = settings[0]?.currency ?? (await getWorkspaceSettings()).defaultCurrency;
  return buildProjectFundingOverview({ currency, partnerName: settings[0]?.partnerName, costs, payments, receipts, agreements, allocations, donationPromises,
    donationReceiptIds: donations.flatMap(row => row.receiptId ? [row.receiptId] : []) });
}
