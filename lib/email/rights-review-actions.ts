"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { enqueueAndProcessAgreementAttachment } from "@/lib/agreement-chat/indexing";
import { logActivity } from "@/lib/activity/log";
import { requireRole } from "@/lib/auth/guards";
import { recomputeProjectBlockers } from "@/lib/blockers/engine";
import { db } from "@/lib/db";
import {
  emailRightsReviews,
  emailThreadProjects,
  fileAttachments,
  licenseFeePayments,
  projects,
  rightsHolders,
  rightsItems,
  tasks,
} from "@/lib/db/schema";
import { deriveOverall, type RightsStep } from "@/lib/rights/derive";
import { processEmailRightsReview } from "@/lib/email/rights-review";
import { validatedAgreementProjectIds } from "@/lib/email/rights-review-selection";
import { reconcileSatisfiedRightsTasks } from "@/lib/rights/task-reconciliation";

const agreementSchema = z.object({
  kind: z.literal("signed_agreement"),
  projectIds: z.array(z.string().uuid()).min(1),
  step: z.enum(["mou", "license"]),
  agreementType: z.enum(["mou_only", "mou_plus_license", "license_only"]),
  signedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  holderId: z.string().uuid().nullable(),
  territory: z.string().trim().max(300).nullable(),
  commercialGranted: z.boolean(),
  formatPrint: z.boolean(),
  formatEbook: z.boolean(),
  formatAudio: z.boolean(),
  formatVideo: z.boolean(),
});

const paymentSchema = z.object({
  kind: z.literal("license_fee_receipt"),
  paymentId: z.string().uuid().nullable(),
  amount: z.coerce.number().positive().max(1_000_000_000),
  currency: z.string().trim().min(3).max(8).transform((value) => value.toUpperCase()),
  paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const approvalSchema = z.discriminatedUnion("kind", [agreementSchema, paymentSchema]);

async function refreshProjects(threadId: string, projectIds: string[]) {
  const uniqueProjectIds = [...new Set(projectIds)];
  const rows = uniqueProjectIds.length
    ? await db
        .select({ id: projects.id, slug: projects.slug })
        .from(projects)
        .where(inArray(projects.id, uniqueProjectIds))
    : [];
  revalidatePath(`/correspondence/${threadId}`);
  for (const row of rows) {
    revalidatePath(`/projects/${row.slug}/rights`);
    revalidatePath(`/projects/${row.slug}/budget`);
    revalidatePath(`/projects/${row.slug}/tasks`);
    revalidatePath(`/projects/${row.slug}`);
  }
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  for (const projectId of uniqueProjectIds) {
    await recomputeProjectBlockers(projectId);
  }
}

async function refreshReview(reviewId: string, projectId?: string) {
  const [row] = await db
    .select({
      threadId: emailRightsReviews.threadId,
      projectId: emailRightsReviews.projectId,
    })
    .from(emailRightsReviews)
    .where(eq(emailRightsReviews.id, reviewId))
    .limit(1);
  if (!row) return;
  await refreshProjects(row.threadId, [projectId ?? row.projectId]);
}

export async function dismissEmailRightsReview(reviewId: string) {
  await requireRole("manager");
  await db
    .update(emailRightsReviews)
    .set({ status: "dismissed", updatedAt: new Date() })
    .where(
      and(
        eq(emailRightsReviews.id, reviewId),
        inArray(emailRightsReviews.status, ["pending", "processing", "ready", "failed"])
      )
    );
  await refreshReview(reviewId);
  return {};
}

export async function retryEmailRightsReview(reviewId: string) {
  await requireRole("manager");
  await db
    .update(emailRightsReviews)
    .set({ status: "pending", error: null, updatedAt: new Date() })
    .where(
      and(
        eq(emailRightsReviews.id, reviewId),
        eq(emailRightsReviews.status, "failed")
      )
    );
  await processEmailRightsReview(reviewId);
  await refreshReview(reviewId);
  return {};
}

export async function approveEmailRightsReview(
  reviewId: string,
  input: z.input<typeof approvalSchema>
) {
  const { user } = await requireRole("manager");
  const data = approvalSchema.parse(input);
  const [review] = await db
    .select()
    .from(emailRightsReviews)
    .where(
      and(
        eq(emailRightsReviews.id, reviewId),
        eq(emailRightsReviews.status, "ready")
      )
    )
    .limit(1);
  if (!review || review.kind !== data.kind) {
    return { error: "This suggestion is no longer available for approval." };
  }

  let targetProjectIds: string[] = [review.projectId];
  if (data.kind === "signed_agreement") {
    const linkedProjects = await db
      .select({ projectId: emailThreadProjects.projectId })
      .from(emailThreadProjects)
      .where(eq(emailThreadProjects.threadId, review.threadId));
    const validated = validatedAgreementProjectIds(
      data.projectIds,
      linkedProjects.map((project) => project.projectId)
    );
    if (!validated) {
      return { error: "Select at least one project linked to this email." };
    }
    targetProjectIds = validated;
  }

  const agreementAttachmentIds: string[] = [];
  let summary = "Approved an email rights update";
  await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(emailRightsReviews)
      .set({ status: "processing", updatedAt: new Date() })
      .where(
        and(
          eq(emailRightsReviews.id, review.id),
          eq(emailRightsReviews.status, "ready")
        )
      )
      .returning({ id: emailRightsReviews.id });
    if (!claimed) {
      throw new Error("This suggestion is already being handled.");
    }
    if (data.kind === "signed_agreement") {
      if (data.holderId) {
        const [holder] = await tx
          .select({ id: rightsHolders.id })
          .from(rightsHolders)
          .where(eq(rightsHolders.id, data.holderId))
          .limit(1);
        if (!holder) throw new Error("Select a valid publisher / rights holder.");
      }
      const mouApplies = data.agreementType !== "license_only";
      const licenseApplies = data.agreementType !== "mou_only";
      if ((data.step === "mou" && !mouApplies) || (data.step === "license" && !licenseApplies)) {
        throw new Error("The selected agreement step does not apply to this agreement type.");
      }

      for (const projectId of targetProjectIds) {
        await tx
          .insert(rightsItems)
          .values({ projectId, createdBy: user.id })
          .onConflictDoNothing({ target: rightsItems.projectId });
        const [rights] = await tx
          .select()
          .from(rightsItems)
          .where(eq(rightsItems.projectId, projectId))
          .limit(1);
        if (!rights) {
          throw new Error("A project rights record could not be loaded.");
        }

        const mouStatus: RightsStep = !mouApplies
          ? "not_needed"
          : data.step === "mou"
            ? "signed"
            : rights.mouStatus;
        const licenseStatus: RightsStep = !licenseApplies
          ? "not_needed"
          : data.step === "license"
            ? "signed"
            : rights.licenseStatus;
        await tx
          .update(rightsItems)
          .set({
            agreementType: data.agreementType,
            mouStatus,
            licenseStatus,
            overallStatus: deriveOverall(
              data.agreementType,
              mouStatus,
              licenseStatus
            ),
            ...(data.step === "mou"
              ? {
                  mouSignedDate: data.signedDate,
                  mouHolderId: data.holderId,
                  mouCommercial: data.commercialGranted,
                }
              : {
                  licenseSignedDate: data.signedDate,
                  licenseHolderId: data.holderId,
                }),
            territory: data.territory ?? rights.territory,
            commercialGranted:
              rights.commercialGranted || data.commercialGranted,
            formatPrint: rights.formatPrint || data.formatPrint,
            formatEbook: rights.formatEbook || data.formatEbook,
            formatAudio: rights.formatAudio || data.formatAudio,
            formatVideo: rights.formatVideo || data.formatVideo,
            updatedAt: new Date(),
          })
          .where(eq(rightsItems.id, rights.id));
        const [existingAttachment] = await tx
          .select({ id: fileAttachments.id })
          .from(fileAttachments)
          .where(
            and(
              eq(fileAttachments.fileId, review.fileId),
              eq(fileAttachments.targetType, "rights_item"),
              eq(fileAttachments.targetId, rights.id),
              eq(fileAttachments.label, data.step)
            )
          )
          .limit(1);
        if (existingAttachment) {
          agreementAttachmentIds.push(existingAttachment.id);
        } else {
          const [attachment] = await tx
            .insert(fileAttachments)
            .values({
              fileId: review.fileId,
              targetType: "rights_item",
              targetId: rights.id,
              label: data.step,
            })
            .returning({ id: fileAttachments.id });
          agreementAttachmentIds.push(attachment.id);
        }
      }

      const reviewedAt = new Date();
      await tx
        .update(emailRightsReviews)
        .set({
          status: "dismissed",
          reviewedBy: user.id,
          reviewedAt,
          updatedAt: reviewedAt,
        })
        .where(
          and(
            eq(emailRightsReviews.threadId, review.threadId),
            eq(emailRightsReviews.attachmentId, review.attachmentId),
            inArray(emailRightsReviews.status, [
              "pending",
              "processing",
              "ready",
              "failed",
            ])
          )
        );
      await tx
        .update(emailRightsReviews)
        .set({
          status: "approved",
          proposal: {
            kind: "signed_agreement",
            confidence: review.proposal?.confidence ?? 1,
            reason:
              review.proposal?.reason ?? "Reviewed signed agreement from email.",
            agreement: {
              step: data.step,
              agreementType: data.agreementType,
              signedDate: data.signedDate,
              holderName: review.proposal?.agreement?.holderName ?? null,
              holderId: data.holderId,
              territory: data.territory,
              commercialGranted: data.commercialGranted,
              formats: {
                print: data.formatPrint,
                ebook: data.formatEbook,
                audio: data.formatAudio,
                video: data.formatVideo,
              },
            },
          },
          reviewedBy: user.id,
          reviewedAt,
          updatedAt: reviewedAt,
        })
        .where(
          and(
            eq(emailRightsReviews.threadId, review.threadId),
            eq(emailRightsReviews.attachmentId, review.attachmentId),
            inArray(emailRightsReviews.projectId, targetProjectIds)
          )
        );
      summary = `Approved signed ${data.step === "mou" ? "MoU" : "license"} from email`;
    } else {
      let payment = data.paymentId
        ? (
            await tx
              .select()
              .from(licenseFeePayments)
              .where(
                and(
                  eq(licenseFeePayments.id, data.paymentId),
                  eq(licenseFeePayments.projectId, review.projectId)
                )
              )
              .limit(1)
          )[0]
        : null;
      if (!payment) {
        await tx
          .insert(rightsItems)
          .values({ projectId: review.projectId, createdBy: user.id })
          .onConflictDoNothing({ target: rightsItems.projectId });
        await tx
          .update(rightsItems)
          .set({
            licenseFeeAmount: data.amount.toFixed(2),
            licenseFeeCurrency: data.currency,
            updatedAt: new Date(),
          })
          .where(eq(rightsItems.projectId, review.projectId));
        [payment] = await tx
          .insert(licenseFeePayments)
          .values({
            projectId: review.projectId,
            period: "initial",
            amount: data.amount.toFixed(2),
            currency: data.currency,
            createdBy: user.id,
          })
          .onConflictDoNothing({
            target: [licenseFeePayments.projectId, licenseFeePayments.period],
          })
          .returning();
        if (!payment) {
          [payment] = await tx
            .select()
            .from(licenseFeePayments)
            .where(
              and(
                eq(licenseFeePayments.projectId, review.projectId),
                eq(licenseFeePayments.period, "initial")
              )
            )
            .limit(1);
        }
      }
      if (!payment) throw new Error("The license-fee payment could not be created.");
      if (payment.paidAt) throw new Error("This license fee is already marked paid.");
      const paidAt = new Date(`${data.paidDate}T12:00:00.000Z`);
      await tx
        .update(licenseFeePayments)
        .set({ paidAt, paidBy: user.id })
        .where(eq(licenseFeePayments.id, payment.id));
      if (payment.taskId) {
        await tx
          .update(tasks)
          .set({ status: "done", completedAt: paidAt, updatedAt: new Date() })
          .where(eq(tasks.id, payment.taskId));
      }
      const [existingReceipt] = await tx
        .select({ id: fileAttachments.id })
        .from(fileAttachments)
        .where(
          and(
            eq(fileAttachments.fileId, review.fileId),
            eq(fileAttachments.targetType, "license_fee_payment"),
            eq(fileAttachments.targetId, payment.id)
          )
        )
        .limit(1);
      if (!existingReceipt) {
        await tx.insert(fileAttachments).values({
          fileId: review.fileId,
          targetType: "license_fee_payment",
          targetId: payment.id,
          label: "receipt",
        });
      }
      summary = "Approved license-fee payment receipt from email";
    }

    if (data.kind === "license_fee_receipt") {
      await tx
        .update(emailRightsReviews)
        .set({
          status: "approved",
          reviewedBy: user.id,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(emailRightsReviews.id, review.id));
    }
  });

  if (agreementAttachmentIds.length) {
    const attachmentIds = [...new Set(agreementAttachmentIds)];
    after(() =>
      Promise.allSettled(
        attachmentIds.map((attachmentId) =>
          enqueueAndProcessAgreementAttachment(attachmentId)
        )
      ).then((results) => {
        const failed = results.filter((result) => result.status === "rejected");
        if (failed.length) {
          console.error(
            `Immediate agreement indexing failed for ${failed.length} attachment(s); cron will retry.`
          );
        }
      })
    );
  }
  if (data.kind === "signed_agreement") {
    for (const projectId of targetProjectIds) {
      await reconcileSatisfiedRightsTasks(projectId, user.id);
    }
  }
  for (const projectId of targetProjectIds) {
    await logActivity({
      actorId: user.id,
      projectId,
      entityType: "rights",
      entityId: review.id,
      action: "approve_email_document",
      summary,
    });
  }
  await refreshProjects(review.threadId, targetProjectIds);
  return {};
}
