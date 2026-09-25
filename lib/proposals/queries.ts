import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { proposalSubmissions, user } from "@/lib/db/schema";

export type ProposalRow = {
  id: string;
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
