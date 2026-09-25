import "server-only";

import { and, asc, desc, eq, isNull, ne, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  budgetItems,
  donationAllocations,
  donationImports,
  donations,
  fundingReceipts,
  invoices,
  mouPayments,
  projectBudgetSettings,
  projects,
  sharedMouGroups,
  sharedMouMemberships,
  user,
} from "@/lib/db/schema";
import { getWorkspaceSettings } from "@/lib/workspace/queries";
import { buildDonationSuggestion } from "./match";
import type {
  DonationAllocationDraft,
  DonationWorkspaceDTO,
} from "./types";

function cents(value: string | number | null | undefined): number {
  return Math.round(Number(value ?? 0) * 100);
}

export async function listDonationFundingReceiptLinks(
  projectId: string
): Promise<
  {
    allocationId: string;
    receiptId: string;
    mouPaymentId: string | null;
  }[]
> {
  const rows = await db
    .select({
      allocationId: donationAllocations.id,
      receiptId: donationAllocations.fundingReceiptId,
      mouPaymentId: donationAllocations.mouPaymentId,
    })
    .from(donationAllocations)
    .where(eq(donationAllocations.projectId, projectId));
  return rows;
}

/** Complete admin donation ledger plus deterministic match suggestions. */
export async function getDonationWorkspace(): Promise<DonationWorkspaceDTO> {
  const workspace = await getWorkspaceSettings();
  const [
    donationRows,
    allocationRows,
    importRows,
    projectRows,
    budgetRows,
    receiptRows,
    receivableRows,
    sharedPaymentRows,
    sharedMemberRows,
  ] = await Promise.all([
    db
      .select({
        id: donations.id,
        importId: donations.importId,
        sourceRowNumber: donations.sourceRowNumber,
        donor: donations.donor,
        donorKey: donations.donorKey,
        campaign: donations.campaign,
        amount: donations.amount,
        currency: donations.currency,
        donationDate: donations.donationDate,
        notes: donations.notes,
        reviewStatus: donations.reviewStatus,
        duplicateOfId: donations.duplicateOfId,
        duplicateResolutionNote: donations.duplicateResolutionNote,
        sourceFilename: donationImports.sourceFilename,
      })
      .from(donations)
      .innerJoin(donationImports, eq(donationImports.id, donations.importId))
      .where(ne(donations.reviewStatus, "duplicate"))
      .orderBy(desc(donations.donationDate), desc(donations.createdAt)),
    db
      .select({
        id: donationAllocations.id,
        donationId: donationAllocations.donationId,
        projectId: donationAllocations.projectId,
        projectTitle: projects.title,
        amount: donationAllocations.amount,
        mouPaymentId: donationAllocations.mouPaymentId,
        sharedMouGroupId: donationAllocations.sharedMouGroupId,
        note: donationAllocations.note,
      })
      .from(donationAllocations)
      .innerJoin(projects, eq(projects.id, donationAllocations.projectId))
      .orderBy(asc(projects.title)),
    db
      .select({
        id: donationImports.id,
        sourceFilename: donationImports.sourceFilename,
        currency: donationImports.currency,
        rowCount: donationImports.rowCount,
        successfulRows: donationImports.successfulRows,
        failedRows: donationImports.failedRows,
        newRows: donationImports.newRows,
        exactDuplicateRows: donationImports.exactDuplicateRows,
        possibleDuplicateRows: donationImports.possibleDuplicateRows,
        successfulAmount: donationImports.successfulAmount,
        createdAt: donationImports.createdAt,
        createdByName: user.name,
      })
      .from(donationImports)
      .leftJoin(user, eq(user.id, donationImports.createdBy))
      .orderBy(desc(donationImports.createdAt)),
    db
      .select({
        id: projects.id,
        title: projects.title,
        slug: projects.slug,
        partnerName: projectBudgetSettings.partnerName,
      })
      .from(projects)
      .leftJoin(
        projectBudgetSettings,
        eq(projectBudgetSettings.projectId, projects.id)
      )
      .where(ne(projects.status, "cancelled"))
      .orderBy(asc(projects.title)),
    db
      .select({
        projectId: budgetItems.projectId,
        total: sql<string>`coalesce(sum(${budgetItems.amount}), 0)`,
      })
      .from(budgetItems)
      .groupBy(budgetItems.projectId),
    db
      .select({
        projectId: fundingReceipts.projectId,
        total: sql<string>`coalesce(sum(${fundingReceipts.amount}), 0)`,
      })
      .from(fundingReceipts)
      .groupBy(fundingReceipts.projectId),
    db
      .select({
        id: mouPayments.id,
        projectId: mouPayments.projectId,
        projectTitle: projects.title,
        amount: mouPayments.amount,
        currency: mouPayments.currency,
        trigger: mouPayments.trigger,
        dueDate: mouPayments.dueDate,
        notes: mouPayments.notes,
        counterparty: projectBudgetSettings.partnerName,
        invoiceNumber: invoices.invoiceNumber,
      })
      .from(mouPayments)
      .innerJoin(projects, eq(projects.id, mouPayments.projectId))
      .leftJoin(
        projectBudgetSettings,
        eq(projectBudgetSettings.projectId, projects.id)
      )
      .leftJoin(
        invoices,
        and(
          eq(invoices.mouPaymentId, mouPayments.id),
          ne(invoices.status, "void")
        )
      )
      .where(
        and(
          isNull(mouPayments.paidAt),
          isNull(mouPayments.sharedMouGroupId)
        )
      )
      .orderBy(asc(mouPayments.dueDate), asc(mouPayments.createdAt)),
    db
      .select({
        paymentId: mouPayments.id,
        groupId: sharedMouGroups.id,
        groupName: sharedMouGroups.name,
        counterparty: sharedMouGroups.counterparty,
        amount: mouPayments.amount,
      })
      .from(mouPayments)
      .innerJoin(
        sharedMouGroups,
        eq(sharedMouGroups.id, mouPayments.sharedMouGroupId)
      )
      .where(isNull(mouPayments.paidAt))
      .orderBy(asc(mouPayments.dueDate), asc(mouPayments.createdAt)),
    db
      .select({
        groupId: sharedMouMemberships.groupId,
        projectId: sharedMouMemberships.projectId,
        projectTitle: projects.title,
        allocationAmount: sharedMouMemberships.allocationAmount,
      })
      .from(sharedMouMemberships)
      .innerJoin(projects, eq(projects.id, sharedMouMemberships.projectId))
      .where(eq(sharedMouMemberships.active, true)),
  ]);

  const allocationsByDonation = new Map<string, DonationAllocationDraft[]>();
  for (const row of allocationRows) {
    const list = allocationsByDonation.get(row.donationId) ?? [];
    list.push({
      key: row.id,
      projectId: row.projectId,
      projectTitle: row.projectTitle,
      amount: row.amount,
      mouPaymentId: row.mouPaymentId,
      sharedMouGroupId: row.sharedMouGroupId,
      evidence: row.note ? [row.note] : [],
    });
    allocationsByDonation.set(row.donationId, list);
  }

  const budgetByProject = new Map(
    budgetRows.map((row) => [row.projectId, cents(row.total)])
  );
  const receivedByProject = new Map(
    receiptRows.map((row) => [row.projectId, cents(row.total)])
  );
  const priorByDonorProject = new Map<string, number>();
  for (const row of donationRows) {
    for (const allocation of allocationsByDonation.get(row.id) ?? []) {
      const key = `${row.donorKey}\u001f${allocation.projectId}`;
      priorByDonorProject.set(key, (priorByDonorProject.get(key) ?? 0) + 1);
    }
  }

  const sharedMembersByGroup = new Map<
    string,
    {
      projectId: string;
      projectTitle: string;
      allocationCents: number;
    }[]
  >();
  for (const member of sharedMemberRows) {
    const list = sharedMembersByGroup.get(member.groupId) ?? [];
    list.push({
      projectId: member.projectId,
      projectTitle: member.projectTitle,
      allocationCents: cents(member.allocationAmount),
    });
    sharedMembersByGroup.set(member.groupId, list);
  }

  const receivables = receivableRows.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    projectTitle: row.projectTitle,
    amountCents: cents(row.amount),
    counterparty: row.counterparty,
    invoiceNumber: row.invoiceNumber,
  }));
  const sharedReceivables = sharedPaymentRows.map((row) => ({
    paymentId: row.paymentId,
    groupId: row.groupId,
    groupName: row.groupName,
    counterparty: row.counterparty,
    amountCents: cents(row.amount),
    members: sharedMembersByGroup.get(row.groupId) ?? [],
  }));

  let needsReviewCount = 0;
  let needsReviewCents = 0;
  let unallocatedCount = 0;
  let unallocatedCents = 0;
  let postedCount = 0;
  let postedCents = 0;

  const rows = donationRows.map((row) => {
    const currentAllocations = allocationsByDonation.get(row.id) ?? [];
    const allocatedCents = currentAllocations.reduce(
      (sum, allocation) => sum + cents(allocation.amount),
      0
    );
    const donationCents = cents(row.amount);
    const remainingCents = donationCents - allocatedCents;
    if (
      row.reviewStatus === "needs_review" ||
      row.reviewStatus === "possible_duplicate"
    ) {
      needsReviewCount += 1;
      needsReviewCents += donationCents;
    }
    if (
      (row.reviewStatus === "unallocated" ||
        row.reviewStatus === "partially_allocated") &&
      remainingCents !== 0
    ) {
      unallocatedCount += 1;
      unallocatedCents += remainingCents;
    }
    if (allocatedCents !== 0) {
      postedCount += 1;
      postedCents += allocatedCents;
    }

    const matchProjects = projectRows.map((project) => ({
      id: project.id,
      title: project.title,
      partnerName: project.partnerName,
      budgetCents: budgetByProject.get(project.id) ?? 0,
      receivedCents: receivedByProject.get(project.id) ?? 0,
      priorAllocationCount:
        priorByDonorProject.get(`${row.donorKey}\u001f${project.id}`) ?? 0,
    }));
    const suggestion = buildDonationSuggestion({
      donation: {
        id: row.id,
        donor: row.donor,
        amountCents: donationCents,
        notes: row.notes,
      },
      projects: matchProjects,
      receivables,
      sharedReceivables,
    });
    return {
      id: row.id,
      importId: row.importId,
      sourceRowNumber: row.sourceRowNumber,
      donor: row.donor,
      campaign: row.campaign,
      amount: row.amount,
      currency: row.currency,
      donationDate: row.donationDate,
      notes: row.notes,
      reviewStatus: row.reviewStatus,
      duplicateOfId: row.duplicateOfId,
      duplicateResolutionNote: row.duplicateResolutionNote,
      sourceFilename: row.sourceFilename,
      allocations: currentAllocations,
      allocatedAmount: (allocatedCents / 100).toFixed(2),
      unallocatedAmount: (remainingCents / 100).toFixed(2),
      suggestion,
    };
  });

  return {
    donations: rows,
    imports: importRows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    })),
    projects: projectRows.map((project) => ({
      id: project.id,
      title: project.title,
      slug: project.slug,
      partnerName: project.partnerName,
    })),
    mouPayments: receivableRows.map((payment) => ({
      id: payment.id,
      projectId: payment.projectId,
      amount: payment.amount,
      currency: payment.currency,
      label:
        payment.notes?.trim() ||
        ({
          on_signing: "On signing",
          on_completion: "On completion",
          on_52_episodes: "Episode milestone",
          custom: "Scheduled payment",
        }[payment.trigger] ?? "Scheduled payment") +
          (payment.dueDate ? ` · due ${payment.dueDate}` : ""),
    })),
    summary: {
      needsReviewCount,
      needsReviewAmount: (needsReviewCents / 100).toFixed(2),
      unallocatedCount,
      unallocatedAmount: (unallocatedCents / 100).toFixed(2),
      postedCount,
      postedAmount: (postedCents / 100).toFixed(2),
      currency: workspace.defaultCurrency,
    },
  };
}
