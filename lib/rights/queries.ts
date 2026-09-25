import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  licenseFeePayments,
  emailThreads,
  rightsContacts,
  rightsHolders,
  rightsItems,
  user,
  fileAttachments,
  files,
} from "@/lib/db/schema";

export type RightsRecord = typeof rightsItems.$inferSelect;

export type LicenseFeePaymentRow = {
  id: string;
  period: string;
  amount: string;
  currency: string;
  dueDate: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  taskId: string | null;
  paidAt: Date | null;
  receipts: Array<{ id: string; fileId: string; fileName: string }>;
};

/** License-fee payments for a project (initial + renewals), newest due first. */
export async function listLicenseFeePayments(
  projectId: string
): Promise<LicenseFeePaymentRow[]> {
  const payments = await db
    .select({
      id: licenseFeePayments.id,
      period: licenseFeePayments.period,
      amount: licenseFeePayments.amount,
      currency: licenseFeePayments.currency,
      dueDate: licenseFeePayments.dueDate,
      assigneeId: licenseFeePayments.assigneeId,
      assigneeName: user.name,
      taskId: licenseFeePayments.taskId,
      paidAt: licenseFeePayments.paidAt,
    })
    .from(licenseFeePayments)
    .leftJoin(user, eq(user.id, licenseFeePayments.assigneeId))
    .where(eq(licenseFeePayments.projectId, projectId))
    .orderBy(desc(licenseFeePayments.dueDate));
  const receipts = payments.length
    ? await db
        .select({
          id: fileAttachments.id,
          paymentId: fileAttachments.targetId,
          fileId: files.id,
          fileName: files.originalName,
        })
        .from(fileAttachments)
        .innerJoin(files, eq(files.id, fileAttachments.fileId))
        .where(
          and(
            eq(fileAttachments.targetType, "license_fee_payment"),
            inArray(
              fileAttachments.targetId,
              payments.map((payment) => payment.id)
            )
          )
        )
    : [];
  return payments.map((payment) => ({
    ...payment,
    receipts: receipts
      .filter((receipt) => receipt.paymentId === payment.id)
      .map(({ paymentId: _paymentId, ...receipt }) => receipt),
  }));
}

/** Copyright holder name + notice for a project (for the Overview / layout team). */
export async function getProjectCopyright(
  projectId: string
): Promise<{ notice: string | null; holderName: string | null }> {
  const [row] = await db
    .select({
      notice: rightsItems.copyrightNotice,
      holderName: rightsHolders.name,
    })
    .from(rightsItems)
    .leftJoin(rightsHolders, eq(rightsHolders.id, rightsItems.copyrightHolderId))
    .where(eq(rightsItems.projectId, projectId))
    .limit(1);
  return { notice: row?.notice ?? null, holderName: row?.holderName ?? null };
}

/** The single rights record for a project (created on first access). */
export async function getOrCreateProjectRights(
  projectId: string,
  createdBy?: string
): Promise<RightsRecord> {
  const [existing] = await db
    .select()
    .from(rightsItems)
    .where(eq(rightsItems.projectId, projectId))
    .limit(1);
  if (existing) return existing;

  await db
    .insert(rightsItems)
    .values({ projectId, createdBy })
    .onConflictDoNothing({ target: rightsItems.projectId });

  const [row] = await db
    .select()
    .from(rightsItems)
    .where(eq(rightsItems.projectId, projectId))
    .limit(1);
  return row;
}

export async function listHoldersWithContacts() {
  const [holders, contacts] = await Promise.all([
    db.select().from(rightsHolders).orderBy(asc(rightsHolders.name)),
    db.select().from(rightsContacts).orderBy(asc(rightsContacts.name)),
  ]);
  return { holders, contacts };
}

/** Project/correspondence references shown before delete or merge decisions. */
export async function listHolderUsage() {
  const [rightsRows, threadRows] = await Promise.all([
    db
      .select({
        projectId: rightsItems.projectId,
        mouHolderId: rightsItems.mouHolderId,
        mouContactId: rightsItems.mouContactId,
        licenseHolderId: rightsItems.licenseHolderId,
        licenseContactId: rightsItems.licenseContactId,
        copyrightHolderId: rightsItems.copyrightHolderId,
      })
      .from(rightsItems),
    db
      .select({
        holderId: emailThreads.holderId,
        contactId: emailThreads.contactId,
      })
      .from(emailThreads),
  ]);
  const contacts = await db
    .select({ id: rightsContacts.id, holderId: rightsContacts.holderId })
    .from(rightsContacts);
  const holderByContact = new Map(
    contacts.map((contact) => [contact.id, contact.holderId])
  );
  const projectIds = new Map<string, Set<string>>();
  for (const row of rightsRows) {
    for (const holderId of [
      row.mouHolderId,
      row.licenseHolderId,
      row.copyrightHolderId,
      row.mouContactId ? holderByContact.get(row.mouContactId) : null,
      row.licenseContactId ? holderByContact.get(row.licenseContactId) : null,
    ]) {
      if (!holderId) continue;
      const ids = projectIds.get(holderId) ?? new Set<string>();
      ids.add(row.projectId);
      projectIds.set(holderId, ids);
    }
  }
  const threadCounts = new Map<string, number>();
  for (const row of threadRows) {
    const holderIds = new Set([
      row.holderId,
      row.contactId ? holderByContact.get(row.contactId) : null,
    ]);
    for (const holderId of holderIds) {
      if (!holderId) continue;
      threadCounts.set(holderId, (threadCounts.get(holderId) ?? 0) + 1);
    }
  }
  const holderIds = new Set([...projectIds.keys(), ...threadCounts.keys()]);
  return [...holderIds].map((holderId) => ({
    holderId,
    projectCount: projectIds.get(holderId)?.size ?? 0,
    threadCount: threadCounts.get(holderId) ?? 0,
  }));
}
