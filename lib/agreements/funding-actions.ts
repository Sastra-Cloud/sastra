"use server";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { activityLog, documentImports, sharedMouGroups, sharedMouMemberships, mouPayments, fileAttachments, projects, user as users } from "@/lib/db/schema";
import { fundingTotalsReconcile, defaultInvoiceOwner } from "./funding-review";
import { reevaluateSharedMouPayments } from "./readiness-engine";

const schema = z.object({
  importId: z.string().uuid(), name: z.string().trim().min(1).max(300),
  counterparty: z.string().trim().min(1).max(300), contactName: z.string().trim().min(1).max(300),
  contactEmail: z.string().email(), signedDate: z.string().date(), currency: z.string().regex(/^[A-Z]{3}$/),
  total: z.number().positive().finite(), ownerId: z.string().nullable(),
  allocations: z.array(z.object({ projectId: z.string().uuid("Select an existing project for every covered work."), amount: z.number().positive().finite() })).min(1),
  installments: z.array(z.object({ amount: z.number().positive().finite(),
    trigger: z.enum(["on_signing", "on_completion", "custom"]), earliestDate: z.string().date().nullable(),
    paymentDueDate: z.string().date().nullable(), description: z.string().trim().min(1).max(2000),
    requirements: z.array(z.string().trim().min(1).max(500)).max(30),
  })).min(1),
});
export type FundingReviewInput = z.infer<typeof schema>;

export async function approveFundingReview(input: FundingReviewInput): Promise<{ error?: string; groupId?: string }> {
  const { user } = await requireRole("manager");
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the review fields." };
  const data = parsed.data;
  if (new Set(data.allocations.map((row) => row.projectId)).size !== data.allocations.length)
    return { error: "Map each work to a different project." };
  if (!fundingTotalsReconcile(data.total, data.allocations.map((row) => row.amount), data.installments.map((row) => row.amount)))
    return { error: "Project allocations and installments must independently equal the agreement total." };
  try {
    const groupId = await db.transaction(async (tx) => {
      const [review] = await tx.select().from(documentImports).where(eq(documentImports.id, data.importId)).for("update");
      if (!review?.fundingSourceKey || !review.fileId) throw new Error("Funding source document not found.");
      if (review.status === "committed") {
        const [existing] = await tx.select({ id: sharedMouGroups.id }).from(sharedMouGroups)
          .where(eq(sharedMouGroups.sourceImportId, review.id)).limit(1);
        if (existing) return existing.id;
        throw new Error("This document was already committed. Review an amendment separately.");
      }
      if (review.status !== "extracted") throw new Error("Wait for document extraction before approval.");
      const source = review.reviewed ?? review.extraction;
      if (source?.documentKind !== "agreement" || source.agreementType === "license_only" || !source.mouPaymentSchedule.length)
        throw new Error("This source does not describe incoming agreement funding. Review the source document again.");
      const covered = await tx.select({ id: projects.id, creatorId: projects.createdBy,
        active: users.isActive, role: users.role, bot: users.isBot }).from(projects)
        .leftJoin(users, eq(users.id, projects.createdBy))
        .where(inArray(projects.id, data.allocations.map((row) => row.projectId)));
      if (covered.length !== data.allocations.length) throw new Error("A mapped project no longer exists.");
      const ownerId = data.ownerId || defaultInvoiceOwner(covered.map((row) => ({ id: row.creatorId,
        eligible: !!row.active && !row.bot && ["manager", "admin", "super_admin"].includes(row.role ?? "") })));
      const [owner] = ownerId ? await tx.select({ id: users.id }).from(users).where(and(eq(users.id, ownerId),
        eq(users.isActive, true), eq(users.isBot, false), inArray(users.role, ["manager", "admin", "super_admin"]))).limit(1) : [];
      if (!owner) throw new Error("Choose an active manager or administrator as invoice owner.");
      const [group] = await tx.insert(sharedMouGroups).values({ name: data.name, counterparty: data.counterparty,
        contactName: data.contactName, contactEmail: data.contactEmail, signedDate: data.signedDate,
        currency: data.currency, agreementTotal: data.total.toFixed(2), sourceImportId: review.id,
        administrativeProjectId: data.allocations[0].projectId, createdBy: user.id,
      }).returning({ id: sharedMouGroups.id });
      await tx.insert(sharedMouMemberships).values(data.allocations.map((row) => ({ groupId: group.id,
        projectId: row.projectId, allocationAmount: row.amount.toFixed(2), addedBy: user.id,
        addedReason: "Approved email funding review." })));
      await tx.insert(mouPayments).values(data.installments.map((row) => ({
        projectId: data.allocations[0].projectId, sharedMouGroupId: group.id, amount: row.amount.toFixed(2),
        currency: data.currency, trigger: row.trigger, dueDate: row.earliestDate ?? (row.trigger === "on_signing" ? data.signedDate : null),
        paymentDueDate: row.paymentDueDate, publicDescription: row.description,
        notes: row.description, deliveryRequirements: row.requirements,
        invoiceAssigneeId: owner.id, createdBy: user.id,
      })));
      await tx.insert(fileAttachments).values({ fileId: review.fileId, targetType: "agreement_group", targetId: group.id, label: "source_agreement" });
      await tx.insert(activityLog).values({ actorId: user.id, entityType: "agreement", entityId: group.id,
        action: "funding_approved", summary: "Approved email funding review", data });
      await tx.update(documentImports).set({ status: "committed", committedAt: new Date(),
        committedProjectIds: data.allocations.map((row) => row.projectId), updatedAt: new Date(),
      }).where(eq(documentImports.id, review.id));
      return group.id;
    });
    await reevaluateSharedMouPayments({ groupId, actorId: user.id });
    revalidatePath("/agreements"); revalidatePath("/correspondence"); revalidatePath("/projects");
    return { groupId };
  } catch (error) { return { error: error instanceof Error ? error.message : "Funding approval failed." }; }
}
