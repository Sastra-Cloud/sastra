"use server";

import { eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import {
  fundingReceipts,
  mouPayments,
  projectPartnerQuotations,
  proposalSubmissions,
} from "@/lib/db/schema";
import { logActivity } from "@/lib/activity/log";
import { getOrCreateBudgetSettings } from "@/lib/budget/queries";
import { revalidateBudget } from "@/lib/budget/revalidate";
import { PROPOSAL_ANSWER_LABELS } from "@/lib/budget/funding-path";

import {
  planProposalAnswer,
  proposalAnswerInput,
  type ProposalAnswerInput,
} from "./answer-plan";

async function loadProposal(id: string) {
  const [proposal] = await db
    .select({
      id: proposalSubmissions.id,
      projectId: proposalSubmissions.projectId,
      printRunId: proposalSubmissions.printRunId,
      currency: proposalSubmissions.currency,
      partnerName: proposalSubmissions.partnerName,
      quotationPartnerName: projectPartnerQuotations.partnerName,
      recipientName: proposalSubmissions.recipientName,
      recipientEmail: proposalSubmissions.recipientEmail,
    })
    .from(proposalSubmissions)
    .leftJoin(
      projectPartnerQuotations,
      eq(projectPartnerQuotations.id, proposalSubmissions.partnerQuotationId)
    )
    .where(eq(proposalSubmissions.id, id))
    .limit(1);
  return proposal ?? null;
}

/** Money on a scheduled payment already has a home; it cannot be relinked here. */
async function receiptsOnExpectedPayments(receiptIds: string[]) {
  if (receiptIds.length === 0) return new Set<string>();
  const rows = await db
    .select({ receiptId: mouPayments.receiptId })
    .from(mouPayments)
    .where(inArray(mouPayments.receiptId, receiptIds));
  return new Set(rows.map((row) => row.receiptId));
}

/**
 * Record what the partner decided about a sent proposal. An MoU or no-MoU
 * answer can add the expected payments in the same save. Nothing is emailed
 * and no money is recorded as received.
 */
export async function setProposalAnswer(
  input: ProposalAnswerInput
): Promise<{ error?: string; warning?: string; paymentIds?: string[] }> {
  const { user } = await requireRole("manager");
  const parsed = proposalAnswerInput.safeParse(input);
  if (!parsed.success) return { error: "Check the answer details and try again." };
  const value = parsed.data;

  const proposal = await loadProposal(value.proposalId);
  if (!proposal) return { error: "Proposal not found. Refresh the page and try again." };
  const settings = await getOrCreateBudgetSettings(proposal.projectId);
  const linkedPayments = await db
    .select({ id: mouPayments.id, paidAt: mouPayments.paidAt })
    .from(mouPayments)
    .where(eq(mouPayments.proposalId, proposal.id));

  const plan = planProposalAnswer({
    input: value,
    proposal,
    budgetCurrency: settings.currency,
    linkedPaymentCount: linkedPayments.length,
    today: new Date().toISOString().slice(0, 10),
  });
  if ("error" in plan) return { error: plan.error };

  const receiptIds = value.answer === "donation" ? [...new Set(value.receiptIds ?? [])] : [];
  if (receiptIds.length > 0) {
    const [rows, scheduled] = await Promise.all([
      db
        .select({
          id: fundingReceipts.id,
          projectId: fundingReceipts.projectId,
          printRunId: fundingReceipts.printRunId,
          proposalId: fundingReceipts.proposalId,
        })
        .from(fundingReceipts)
        .where(inArray(fundingReceipts.id, receiptIds)),
      receiptsOnExpectedPayments(receiptIds),
    ]);
    const invalid =
      rows.length !== receiptIds.length ||
      rows.some(
        (row) =>
          row.projectId !== proposal.projectId ||
          row.printRunId !== proposal.printRunId ||
          (row.proposalId && row.proposalId !== proposal.id) ||
          scheduled.has(row.id)
      );
    if (invalid) {
      return {
        error: "Some of this money changed. Refresh the page and choose it again.",
      };
    }
  }

  const partnerName =
    proposal.partnerName?.trim() ||
    proposal.quotationPartnerName?.trim() ||
    proposal.recipientName?.trim() ||
    proposal.recipientEmail;

  const paymentIds = await db.transaction(async (tx) => {
    await tx
      .update(proposalSubmissions)
      .set({ ...plan.patch, answeredBy: user.id, updatedAt: new Date() })
      .where(eq(proposalSubmissions.id, proposal.id));
    if (plan.basis && linkedPayments.length > 0) {
      // Keep the MoU / No MoU label in step with a corrected answer.
      await tx
        .update(mouPayments)
        .set({ fundingBasis: plan.basis })
        .where(eq(mouPayments.proposalId, proposal.id));
    }
    if (receiptIds.length > 0) {
      await tx
        .update(fundingReceipts)
        .set({ proposalId: proposal.id, updatedAt: new Date() })
        .where(inArray(fundingReceipts.id, receiptIds));
    }
    if (plan.payments.length === 0) return [];
    const created = await tx
      .insert(mouPayments)
      .values(
        plan.payments.map((payment) => ({
          projectId: proposal.projectId,
          printRunId: proposal.printRunId,
          proposalId: proposal.id,
          fundingBasis: plan.basis,
          partnerName,
          amount: payment.amount,
          currency: settings.currency,
          trigger: payment.trigger,
          notes: payment.notes,
          publicDescription: payment.publicDescription,
          createdBy: user.id,
        }))
      )
      .returning({ id: mouPayments.id });
    return created.map((row) => row.id);
  });

  await logActivity({
    actorId: user.id,
    projectId: proposal.projectId,
    entityType: "budget",
    entityId: proposal.id,
    action: "proposal",
    summary: `Recorded partner answer for the proposal to ${partnerName}: ${
      PROPOSAL_ANSWER_LABELS[value.answer]
    }${plan.patch.agreedAmount ? ` (${proposal.currency} ${plan.patch.agreedAmount})` : ""}`,
  });
  await revalidateBudget(proposal.projectId);

  const openPayments = linkedPayments.filter((payment) => !payment.paidAt).length;
  const warning =
    !plan.basis && openPayments > 0
      ? `This proposal still has ${openPayments} expected payment${
          openPayments === 1 ? "" : "s"
        }. Delete ${openPayments === 1 ? "it" : "them"} in Payments if the partner will not pay.`
      : undefined;
  return { paymentIds, warning };
}

const linkInput = z.object({
  receiptId: z.string().uuid(),
  proposalId: z.string().uuid().nullable(),
});

/**
 * Say which proposal a received amount answers, or clear that link. This is a
 * label only: amounts, donation allocations, and payment status do not change.
 */
export async function linkReceiptToProposal(
  input: z.input<typeof linkInput>
): Promise<{ error?: string }> {
  const { user } = await requireRole("manager");
  const parsed = linkInput.safeParse(input);
  if (!parsed.success) return { error: "Choose a proposal and try again." };
  const { receiptId, proposalId } = parsed.data;

  const [receipt] = await db
    .select({
      id: fundingReceipts.id,
      projectId: fundingReceipts.projectId,
      printRunId: fundingReceipts.printRunId,
    })
    .from(fundingReceipts)
    .where(eq(fundingReceipts.id, receiptId))
    .limit(1);
  if (!receipt) return { error: "This money was not found. Refresh the page and try again." };

  let partnerName: string | null = null;
  if (proposalId) {
    if ((await receiptsOnExpectedPayments([receiptId])).has(receiptId)) {
      return {
        error:
          "This money belongs to an expected payment. Link that payment to the proposal instead.",
      };
    }
    const proposal = await loadProposal(proposalId);
    if (
      !proposal ||
      proposal.projectId !== receipt.projectId ||
      proposal.printRunId !== receipt.printRunId
    ) {
      return { error: "Choose a proposal from this budget." };
    }
    partnerName =
      proposal.partnerName?.trim() ||
      proposal.quotationPartnerName?.trim() ||
      proposal.recipientName?.trim() ||
      proposal.recipientEmail;
  }

  await db
    .update(fundingReceipts)
    .set({ proposalId, updatedAt: new Date() })
    .where(eq(fundingReceipts.id, receiptId));
  await logActivity({
    actorId: user.id,
    projectId: receipt.projectId,
    entityType: "budget",
    entityId: receiptId,
    action: "receipt",
    summary: proposalId
      ? `Linked received funding to the proposal to ${partnerName}`
      : "Removed the proposal link from received funding",
  });
  await revalidateBudget(receipt.projectId);
  return {};
}
