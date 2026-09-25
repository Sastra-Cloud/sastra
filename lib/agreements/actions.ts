"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql, inArray } from "drizzle-orm";
import { z } from "zod";

import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import {
  invoices,
  activityLog,
  files,
  fileAttachments,
  user as users,
  mouPayments,
  projects,
  sharedMouGroups,
  sharedMouMembershipAudits,
  sharedMouMemberships,
} from "@/lib/db/schema";
import { reevaluateSharedMouPayments } from "./readiness-engine";

const reasonSchema = z.string().trim().min(5).max(500);
const amountSchema = z.coerce.number().min(0).finite();

async function updateReconciliation(groupId: string) {
  const [row] = await db
    .select({
      agreementTotal: sharedMouGroups.agreementTotal,
      allocated: sql<string>`coalesce(sum(${sharedMouMemberships.allocationAmount}) filter (where ${sharedMouMemberships.active}), 0)`,
    })
    .from(sharedMouGroups)
    .leftJoin(
      sharedMouMemberships,
      eq(sharedMouMemberships.groupId, sharedMouGroups.id)
    )
    .where(eq(sharedMouGroups.id, groupId))
    .groupBy(sharedMouGroups.id);
  if (!row) return;
  const difference = Math.abs(Number(row.agreementTotal) - Number(row.allocated));
  await db
    .update(sharedMouGroups)
    .set({
      reviewRequired: difference > 0.005,
      reviewNote:
        difference > 0.005
          ? `Active project allocations differ from the agreement total by ${difference.toFixed(2)}.`
          : null,
      updatedAt: new Date(),
    })
    .where(eq(sharedMouGroups.id, groupId));
}

async function dependentPaymentIsFinalized(groupId: string) {
  const rows = await db
    .select({ paidAt: mouPayments.paidAt, invoiceId: invoices.id })
    .from(mouPayments)
    .leftJoin(invoices, eq(invoices.mouPaymentId, mouPayments.id))
    .where(eq(mouPayments.sharedMouGroupId, groupId));
  return rows.some((row) => row.paidAt || row.invoiceId);
}

async function finish(groupId: string, actorId: string) {
  await updateReconciliation(groupId);
  await reevaluateSharedMouPayments({ groupId, actorId });
  revalidatePath(`/agreements/${groupId}`);
  revalidatePath("/agreements");
  revalidatePath("/projects");
}

export async function addSharedMouMember(input: {
  groupId: string;
  projectId: string;
  allocationAmount: string | number;
  reason: string;
}): Promise<{ error?: string }> {
  const { user } = await requireRole("manager");
  const parsed = z
    .object({
      groupId: z.string().uuid(),
      projectId: z.string().uuid(),
      allocationAmount: amountSchema,
      reason: reasonSchema,
    })
    .safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const data = parsed.data;
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, data.projectId))
    .limit(1);
  if (!project) return { error: "Project not found." };

  await db.transaction(async (tx) => {
    await tx.select({ id: sharedMouGroups.id }).from(sharedMouGroups).where(eq(sharedMouGroups.id, data.groupId)).for("update");
    const [existing] = await tx
      .select()
      .from(sharedMouMemberships)
      .where(
        and(
          eq(sharedMouMemberships.groupId, data.groupId),
          eq(sharedMouMemberships.projectId, data.projectId)
        )
      )
      .limit(1);
    if (existing?.active) throw new Error("Project is already in this group.");
    const amount = data.allocationAmount.toFixed(2);
    const [membership] = existing
      ? await tx
          .update(sharedMouMemberships)
          .set({
            active: true,
            allocationAmount: amount,
            addedBy: user.id,
            addedReason: data.reason,
            addedAt: new Date(),
            removedBy: null,
            removedReason: null,
            removedAt: null,
          })
          .where(eq(sharedMouMemberships.id, existing.id))
          .returning({ id: sharedMouMemberships.id })
      : await tx
          .insert(sharedMouMemberships)
          .values({
            groupId: data.groupId,
            projectId: data.projectId,
            allocationAmount: amount,
            addedBy: user.id,
            addedReason: data.reason,
          })
          .returning({ id: sharedMouMemberships.id });
    await tx.insert(sharedMouMembershipAudits).values({
      groupId: data.groupId,
      membershipId: membership.id,
      projectId: data.projectId,
      action: existing ? "reactivated" : "added",
      previousAllocation: existing?.allocationAmount ?? null,
      nextAllocation: amount,
      reason: data.reason,
      managerId: user.id,
    });
  }).catch((error: unknown) => {
    if (error instanceof Error) throw error;
  });
  await finish(data.groupId, user.id);
  return {};
}

export async function removeSharedMouMember(input: {
  membershipId: string;
  reason: string;
}): Promise<{ error?: string }> {
  const { user } = await requireRole("manager");
  const parsed = z
    .object({ membershipId: z.string().uuid(), reason: reasonSchema })
    .safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const [membership] = await db
    .select()
    .from(sharedMouMemberships)
    .where(eq(sharedMouMemberships.id, parsed.data.membershipId))
    .limit(1);
  if (!membership?.active) return { error: "Active membership not found." };
  const [group] = await db
    .select({ administrativeProjectId: sharedMouGroups.administrativeProjectId })
    .from(sharedMouGroups)
    .where(eq(sharedMouGroups.id, membership.groupId))
    .limit(1);
  if (group?.administrativeProjectId === membership.projectId) {
    return {
      error:
        "This project is the hidden compatibility anchor. Replace it with another project instead of removing it.",
    };
  }
  if (await dependentPaymentIsFinalized(membership.groupId)) {
    return {
      error:
        "This project cannot be removed after a dependent payment was invoiced or received. Record a correcting transaction instead.",
    };
  }
  await db.transaction(async (tx) => {
    await tx.select({ id: sharedMouGroups.id }).from(sharedMouGroups).where(eq(sharedMouGroups.id, membership.groupId)).for("update");
    await tx
      .update(sharedMouMemberships)
      .set({
        active: false,
        removedBy: user.id,
        removedReason: parsed.data.reason,
        removedAt: new Date(),
      })
      .where(eq(sharedMouMemberships.id, membership.id));
    await tx.insert(sharedMouMembershipAudits).values({
      groupId: membership.groupId,
      membershipId: membership.id,
      projectId: membership.projectId,
      action: "removed",
      previousAllocation: membership.allocationAmount,
      nextAllocation: null,
      reason: parsed.data.reason,
      managerId: user.id,
    });
  });
  await finish(membership.groupId, user.id);
  return {};
}

export async function replaceSharedMouMember(input: {
  membershipId: string;
  projectId: string;
  reason: string;
}): Promise<{ error?: string }> {
  const { user } = await requireRole("manager");
  const parsed = z
    .object({
      membershipId: z.string().uuid(),
      projectId: z.string().uuid(),
      reason: reasonSchema,
    })
    .safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const [current] = await db
    .select()
    .from(sharedMouMemberships)
    .where(eq(sharedMouMemberships.id, parsed.data.membershipId))
    .limit(1);
  if (!current?.active) return { error: "Active membership not found." };
  if (await dependentPaymentIsFinalized(current.groupId)) {
    return {
      error:
        "This project cannot be replaced after a dependent payment was invoiced or received. Record a correcting transaction instead.",
    };
  }
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, parsed.data.projectId))
    .limit(1);
  if (!project) return { error: "Replacement project not found." };
  const [existing] = await db
    .select()
    .from(sharedMouMemberships)
    .where(
      and(
        eq(sharedMouMemberships.groupId, current.groupId),
        eq(sharedMouMemberships.projectId, parsed.data.projectId)
      )
    )
    .limit(1);
  if (existing?.active) return { error: "Replacement project is already active." };

  await db.transaction(async (tx) => {
    await tx.select({ id: sharedMouGroups.id }).from(sharedMouGroups).where(eq(sharedMouGroups.id, current.groupId)).for("update");
    const [replacement] = existing
      ? await tx
          .update(sharedMouMemberships)
          .set({
            active: true,
            allocationAmount: current.allocationAmount,
            addedBy: user.id,
            addedReason: parsed.data.reason,
            addedAt: new Date(),
            removedBy: null,
            removedReason: null,
            removedAt: null,
          })
          .where(eq(sharedMouMemberships.id, existing.id))
          .returning({ id: sharedMouMemberships.id })
      : await tx
          .insert(sharedMouMemberships)
          .values({
            groupId: current.groupId,
            projectId: parsed.data.projectId,
            allocationAmount: current.allocationAmount,
            addedBy: user.id,
            addedReason: parsed.data.reason,
          })
          .returning({ id: sharedMouMemberships.id });
    await tx
      .update(sharedMouMemberships)
      .set({
        active: false,
        removedBy: user.id,
        removedReason: parsed.data.reason,
        removedAt: new Date(),
      })
      .where(eq(sharedMouMemberships.id, current.id));
    await tx
      .update(sharedMouGroups)
      .set({ administrativeProjectId: parsed.data.projectId, updatedAt: new Date() })
      .where(
        and(
          eq(sharedMouGroups.id, current.groupId),
          eq(sharedMouGroups.administrativeProjectId, current.projectId)
        )
      );
    await tx.insert(sharedMouMembershipAudits).values([
      {
        groupId: current.groupId,
        membershipId: current.id,
        projectId: current.projectId,
        action: "replaced",
        previousAllocation: current.allocationAmount,
        nextAllocation: null,
        reason: parsed.data.reason,
        managerId: user.id,
      },
      {
        groupId: current.groupId,
        membershipId: replacement.id,
        projectId: parsed.data.projectId,
        action: "replacement_added",
        previousAllocation: existing?.allocationAmount ?? null,
        nextAllocation: current.allocationAmount,
        reason: parsed.data.reason,
        managerId: user.id,
      },
    ]);
  });
  await finish(current.groupId, user.id);
  return {};
}

export async function updateSharedMouAllocation(input: {
  membershipId: string;
  allocationAmount: string | number;
  reason: string;
}): Promise<{ error?: string }> {
  const { user } = await requireRole("manager");
  const parsed = z
    .object({
      membershipId: z.string().uuid(),
      allocationAmount: amountSchema,
      reason: reasonSchema,
    })
    .safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const [membership] = await db
    .select()
    .from(sharedMouMemberships)
    .where(eq(sharedMouMemberships.id, parsed.data.membershipId))
    .limit(1);
  if (!membership?.active) return { error: "Active membership not found." };
  const amount = parsed.data.allocationAmount.toFixed(2);
  await db.transaction(async (tx) => {
    await tx.select({ id: sharedMouGroups.id }).from(sharedMouGroups).where(eq(sharedMouGroups.id, membership.groupId)).for("update");
    await tx
      .update(sharedMouMemberships)
      .set({ allocationAmount: amount })
      .where(eq(sharedMouMemberships.id, membership.id));
    await tx.insert(sharedMouMembershipAudits).values({
      groupId: membership.groupId,
      membershipId: membership.id,
      projectId: membership.projectId,
      action: "allocation_changed",
      previousAllocation: membership.allocationAmount,
      nextAllocation: amount,
      reason: parsed.data.reason,
      managerId: user.id,
    });
  });
  await finish(membership.groupId, user.id);
  return {};
}

export async function updateSharedMouNotes(
  groupId: string,
  notes: string
): Promise<{ error?: string }> {
  await requireRole("manager");
  const parsed = z
    .object({ groupId: z.string().uuid(), notes: z.string().max(5000) })
    .safeParse({ groupId, notes });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  await db
    .update(sharedMouGroups)
    .set({ managerNotes: parsed.data.notes.trim() || null, updatedAt: new Date() })
    .where(eq(sharedMouGroups.id, groupId));
  revalidatePath(`/agreements/${groupId}`);
  return {};
}

export async function updateSharedMouPayment(input: {
  paymentId: string;
  dueDate: string | null;
  invoiceAssigneeId: string | null;
  notes: string;
}): Promise<{ error?: string }> {
  const { user } = await requireRole("manager");
  const parsed = z
    .object({
      paymentId: z.string().uuid(),
      dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
      invoiceAssigneeId: z.string().nullable(),
      notes: z.string().max(500),
    })
    .safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  if (!parsed.data.invoiceAssigneeId) return { error: "Select an eligible invoice owner." };
  const [owner] = await db.select({ id: users.id }).from(users).where(and(
    eq(users.id, parsed.data.invoiceAssigneeId), eq(users.isActive, true), eq(users.isBot, false),
    inArray(users.role, ["manager", "admin", "super_admin"])
  )).limit(1);
  if (!owner) return { error: "Invoice owner must be an active manager or administrator." };
  const [payment] = await db
    .select({ groupId: mouPayments.sharedMouGroupId })
    .from(mouPayments)
    .where(eq(mouPayments.id, parsed.data.paymentId))
    .limit(1);
  if (!payment?.groupId) return { error: "Shared MoU payment not found." };
  await db
    .update(mouPayments)
    .set({
      dueDate: parsed.data.dueDate,
      invoiceAssigneeId: parsed.data.invoiceAssigneeId || null,
      notes: parsed.data.notes.trim() || null,
    })
    .where(eq(mouPayments.id, parsed.data.paymentId));
  await reevaluateSharedMouPayments({ groupId: payment.groupId, actorId: user.id });
  revalidatePath(`/agreements/${payment.groupId}`);
  revalidatePath("/tasks");
  return {};
}

/** Reviewed delivery confirmation is audited atomically with its evidence. */
export async function confirmSharedMouDelivery(input: {
  paymentId: string; evidence: Array<{ requirement: string; url: string; fileId?: string }>; confirmed: boolean;
}): Promise<{ error?: string }> {
  const { user } = await requireRole("manager");
  const parsed = z.object({ paymentId: z.string().uuid(), confirmed: z.boolean(),
    evidence: z.array(z.object({ requirement: z.string().min(1).max(500),
      fileId: z.string().uuid().optional(),
      url: z.string().refine((url) => !url || /^https?:\/\//i.test(url), "Use an HTTP or HTTPS evidence link.") })).max(30),
  }).safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  try {
    const groupId = await db.transaction(async (tx) => {
      const [payment] = await tx.select().from(mouPayments).where(eq(mouPayments.id, input.paymentId)).for("update");
      if (!payment?.sharedMouGroupId) throw new Error("Shared payment not found.");
      const [sending] = await tx.select({ id: invoices.id }).from(invoices).where(and(eq(invoices.mouPaymentId, payment.id),
        inArray(invoices.status, ["sending", "sent"])));
      if (sending || payment.paidAt) throw new Error("Delivery has already been sent or received. Preserve its evidence history.");
      for (const item of parsed.data.evidence) {
        if (!item.url && !item.fileId) throw new Error("Add a file or link for each evidence item.");
        if (item.fileId) {
          const [file] = await tx.select({ id: files.id }).from(files).innerJoin(fileAttachments, eq(fileAttachments.fileId, files.id))
            .where(and(eq(files.id, item.fileId), eq(files.status, "ready"), eq(fileAttachments.targetType, "agreement_group"),
              eq(fileAttachments.targetId, payment.sharedMouGroupId))).limit(1);
          if (!file) throw new Error("Upload the evidence file to this agreement before selecting it.");
        }
      }
      const missing = (payment.deliveryRequirements ?? []).filter((requirement) => !parsed.data.evidence.some((item) => item.requirement === requirement));
      if (input.confirmed && missing.length) throw new Error(`Evidence required: ${missing.join(", ")}.`);
      const next = { deliveryEvidence: parsed.data.evidence,
        deliveryConfirmedAt: input.confirmed ? new Date() : null, deliveryConfirmedBy: input.confirmed ? user.id : null };
      await tx.update(mouPayments).set(next).where(eq(mouPayments.id, payment.id));
      await tx.insert(activityLog).values({ actorId: user.id, entityType: "agreement", entityId: payment.sharedMouGroupId,
        action: "delivery_reviewed", summary: input.confirmed ? "Confirmed installment delivery" : "Updated delivery evidence; confirmation cleared",
        data: { paymentId: payment.id, previous: payment.deliveryEvidence, evidence: next.deliveryEvidence, confirmed: input.confirmed } });
      return payment.sharedMouGroupId;
    });
    await reevaluateSharedMouPayments({ groupId, actorId: user.id });
    revalidatePath(`/agreements/${groupId}`);
    return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "Could not save delivery review." }; }
}
