import "server-only";

import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  fundingReceipts,
  mouPayments,
  projectPartnerQuotations,
  proposalSubmissions,
  user,
} from "@/lib/db/schema";

export type ProposalRow = {
  id: string;
  partnerQuotationId?: string | null;
  /** Partner organization: saved at send time, else the quotation's partner. */
  partnerName: string | null;
  fundingPath: string | null;
  agreedAmount: string | null;
  answeredOn: string | null;
  answerNote: string | null;
  recipientName: string | null;
  recipientEmail: string;
  subject: string;
  currency: string;
  totalAmount: string;
  budgetApprovalRequestId: string | null;
  budgetApprovalFingerprint: string | null;
  fileId: string | null;
  status: string;
  sentAt: Date;
  sentByName: string | null;
};

export async function listProposals(
  projectId: string,
  printRunId?: string | null
): Promise<ProposalRow[]> {
  return db
    .select({
      id: proposalSubmissions.id,
      partnerQuotationId: proposalSubmissions.partnerQuotationId,
      partnerName: sql<string | null>`coalesce(nullif(${proposalSubmissions.partnerName}, ''), nullif(${projectPartnerQuotations.partnerName}, ''))`,
      fundingPath: proposalSubmissions.fundingPath,
      agreedAmount: proposalSubmissions.agreedAmount,
      answeredOn: proposalSubmissions.answeredOn,
      answerNote: proposalSubmissions.answerNote,
      recipientName: proposalSubmissions.recipientName,
      recipientEmail: proposalSubmissions.recipientEmail,
      subject: proposalSubmissions.subject,
      currency: proposalSubmissions.currency,
      totalAmount: proposalSubmissions.totalAmount,
      budgetApprovalRequestId: proposalSubmissions.budgetApprovalRequestId,
      budgetApprovalFingerprint: proposalSubmissions.budgetApprovalFingerprint,
      fileId: proposalSubmissions.fileId,
      status: proposalSubmissions.status,
      sentAt: proposalSubmissions.sentAt,
      sentByName: user.name,
    })
    .from(proposalSubmissions)
    .leftJoin(user, eq(user.id, proposalSubmissions.sentByUserId))
    .leftJoin(
      projectPartnerQuotations,
      eq(projectPartnerQuotations.id, proposalSubmissions.partnerQuotationId)
    )
    .where(
      and(
        eq(proposalSubmissions.projectId, projectId),
        printRunId
          ? eq(proposalSubmissions.printRunId, printRunId)
          : isNull(proposalSubmissions.printRunId)
      )
    )
    .orderBy(desc(proposalSubmissions.sentAt));
}

/**
 * Donation promises not yet received, per project, as amounts. A promised
 * donation has no expected payment row, so funding summaries add its
 * outstanding part to committed funding. Money already linked to the proposal
 * is left out because it counts as received funding.
 */
export async function openDonationPromisesByProject(
  projectIds: string[]
): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  if (projectIds.length === 0) return totals;
  const rows = await db
    .select({
      projectId: proposalSubmissions.projectId,
      agreed: sql<number>`${proposalSubmissions.agreedAmount}::float8`,
      received: sql<number>`coalesce(sum(${fundingReceipts.amount}) filter (where ${mouPayments.id} is null), 0)::float8`,
    })
    .from(proposalSubmissions)
    .leftJoin(
      fundingReceipts,
      eq(fundingReceipts.proposalId, proposalSubmissions.id)
    )
    .leftJoin(mouPayments, eq(mouPayments.receiptId, fundingReceipts.id))
    .where(
      and(
        inArray(proposalSubmissions.projectId, projectIds),
        eq(proposalSubmissions.status, "accepted"),
        eq(proposalSubmissions.fundingPath, "donation"),
        isNotNull(proposalSubmissions.agreedAmount)
      )
    )
    .groupBy(proposalSubmissions.id);
  for (const row of rows) {
    const open = Math.max(
      0,
      Math.round(row.agreed * 100) - Math.round(row.received * 100)
    );
    if (open > 0) {
      totals.set(row.projectId, (totals.get(row.projectId) ?? 0) + open / 100);
    }
  }
  return totals;
}
