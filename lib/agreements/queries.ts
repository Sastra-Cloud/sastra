import "server-only";

import { and, asc, desc, eq, inArray, sql, ne } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  invoices,
  mouPayments,
  projects,
  sharedMouGroups,
  sharedMouMembershipAudits,
  sharedMouMemberships,
  sharedMouReceiptAllocations,
  sharedMouReceipts,
  tasks,
  user,
} from "@/lib/db/schema";

export type SharedMouProjectLink = {
  id: string;
  name: string;
  currency: string;
  allocationAmount: string;
  schedule: Array<{ id: string; amount: string; trigger: string; readinessReason: string | null; invoiceTaskId: string | null }>;
};

export async function listSharedMouGroups() {
  const groups = await db
    .select()
    .from(sharedMouGroups)
    .orderBy(desc(sharedMouGroups.signedDate), asc(sharedMouGroups.name));
  if (groups.length === 0) return [];
  const members = await db
    .select({
      groupId: sharedMouMemberships.groupId,
      status: projects.status,
    })
    .from(sharedMouMemberships)
    .innerJoin(projects, eq(projects.id, sharedMouMemberships.projectId))
    .where(
      and(
        inArray(
          sharedMouMemberships.groupId,
          groups.map((group) => group.id)
        ),
        eq(sharedMouMemberships.active, true)
      )
    );
  const byGroup = new Map<string, { total: number; completed: number }>();
  for (const member of members) {
    const counts = byGroup.get(member.groupId) ?? { total: 0, completed: 0 };
    counts.total += 1;
    if (member.status === "completed") counts.completed += 1;
    byGroup.set(member.groupId, counts);
  }
  return groups.map((group) => ({
    ...group,
    ...(byGroup.get(group.id) ?? { total: 0, completed: 0 }),
  }));
}

export async function listSharedMouGroupsForProject(
  projectId: string
): Promise<SharedMouProjectLink[]> {
  const groups = await db
    .select({
      id: sharedMouGroups.id,
      name: sharedMouGroups.name,
      currency: sharedMouGroups.currency,
      allocationAmount: sharedMouMemberships.allocationAmount,
    })
    .from(sharedMouMemberships)
    .innerJoin(sharedMouGroups, eq(sharedMouGroups.id, sharedMouMemberships.groupId))
    .where(
      and(
        eq(sharedMouMemberships.projectId, projectId),
        eq(sharedMouMemberships.active, true)
      )
    )
    .orderBy(asc(sharedMouGroups.name));
  if (!groups.length) return [];
  const payments = await db.select({ id: mouPayments.id, groupId: mouPayments.sharedMouGroupId,
    amount: mouPayments.amount, trigger: mouPayments.trigger, readinessReason: mouPayments.readinessReason,
    invoiceTaskId: mouPayments.invoiceTaskId }).from(mouPayments)
    .where(inArray(mouPayments.sharedMouGroupId, groups.map((group) => group.id))).orderBy(asc(mouPayments.createdAt));
  return groups.map((group) => ({ ...group, schedule: payments.filter((payment) => payment.groupId === group.id) }));
}

export async function getSharedMouGroup(id: string) {
  const [group] = await db
    .select()
    .from(sharedMouGroups)
    .where(eq(sharedMouGroups.id, id))
    .limit(1);
  if (!group) return null;

  const [members, payments, audits, receipts] = await Promise.all([
    db
      .select({
        id: sharedMouMemberships.id,
        projectId: sharedMouMemberships.projectId,
        allocationAmount: sharedMouMemberships.allocationAmount,
        active: sharedMouMemberships.active,
        addedReason: sharedMouMemberships.addedReason,
        removedReason: sharedMouMemberships.removedReason,
        addedAt: sharedMouMemberships.addedAt,
        removedAt: sharedMouMemberships.removedAt,
        title: projects.title,
        slug: projects.slug,
        status: projects.status,
        totalTasks: sql<number>`count(${tasks.id})::int`,
        completedTasks: sql<number>`count(${tasks.id}) filter (where ${tasks.status} = 'done')::int`,
      })
      .from(sharedMouMemberships)
      .innerJoin(projects, eq(projects.id, sharedMouMemberships.projectId))
      .leftJoin(tasks, eq(tasks.projectId, projects.id))
      .where(eq(sharedMouMemberships.groupId, id))
      .groupBy(sharedMouMemberships.id, projects.id)
      .orderBy(desc(sharedMouMemberships.active), asc(projects.title)),
    db
      .select({
        id: mouPayments.id,
        amount: mouPayments.amount,
        currency: mouPayments.currency,
        trigger: mouPayments.trigger,
        dueDate: mouPayments.dueDate,
        notes: mouPayments.notes,
        deliveryRequirements: mouPayments.deliveryRequirements,
        deliveryEvidence: mouPayments.deliveryEvidence,
        deliveryConfirmedAt: mouPayments.deliveryConfirmedAt,
        invoiceStatus: invoices.status,
        invoiceFileId: sql<string | null>`coalesce(${invoices.sourceFileId}, ${invoices.renderedFileId})`,
        invoiceSourceFileId: invoices.sourceFileId,
        invoiceRecipient: invoices.recipientEmail,
        invoiceAssigneeId: mouPayments.invoiceAssigneeId,
        assigneeName: user.name,
        invoiceTaskId: mouPayments.invoiceTaskId,
        invoiceRequestedAt: mouPayments.invoiceRequestedAt,
        readinessStatus: mouPayments.readinessStatus,
        readinessReason: mouPayments.readinessReason,
        paidAt: mouPayments.paidAt,
        invoiceId: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
      })
      .from(mouPayments)
      .leftJoin(user, eq(user.id, mouPayments.invoiceAssigneeId))
      .leftJoin(invoices, and(eq(invoices.mouPaymentId, mouPayments.id), ne(invoices.status, "void")))
      .where(eq(mouPayments.sharedMouGroupId, id))
      .orderBy(asc(mouPayments.dueDate), asc(mouPayments.createdAt)),
    db
      .select({
        id: sharedMouMembershipAudits.id,
        action: sharedMouMembershipAudits.action,
        projectId: sharedMouMembershipAudits.projectId,
        projectTitle: projects.title,
        previousAllocation: sharedMouMembershipAudits.previousAllocation,
        nextAllocation: sharedMouMembershipAudits.nextAllocation,
        reason: sharedMouMembershipAudits.reason,
        managerName: user.name,
        createdAt: sharedMouMembershipAudits.createdAt,
      })
      .from(sharedMouMembershipAudits)
      .innerJoin(projects, eq(projects.id, sharedMouMembershipAudits.projectId))
      .leftJoin(user, eq(user.id, sharedMouMembershipAudits.managerId))
      .where(eq(sharedMouMembershipAudits.groupId, id))
      .orderBy(desc(sharedMouMembershipAudits.createdAt)),
    db
      .select({
        id: sharedMouReceipts.id,
        paymentId: sharedMouReceipts.paymentId,
        amount: sharedMouReceipts.amount,
        currency: sharedMouReceipts.currency,
        receivedDate: sharedMouReceipts.receivedDate,
        source: sharedMouReceipts.source,
        allocatedAmount: sql<string>`coalesce(sum(${sharedMouReceiptAllocations.amount}), 0)`,
      })
      .from(sharedMouReceipts)
      .leftJoin(
        sharedMouReceiptAllocations,
        eq(sharedMouReceiptAllocations.receiptId, sharedMouReceipts.id)
      )
      .where(eq(sharedMouReceipts.groupId, id))
      .groupBy(sharedMouReceipts.id)
      .orderBy(desc(sharedMouReceipts.createdAt)),
  ]);

  return { group, members, payments, audits, receipts };
}
