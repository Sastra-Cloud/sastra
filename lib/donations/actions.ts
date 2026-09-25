"use server";

import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { allocateSharedReceipt } from "@/lib/agreements/readiness";
import { reevaluateSharedMouPayments } from "@/lib/agreements/readiness-engine";
import { requireDonationAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import {
  donationAllocations,
  donationImports,
  donationReviews,
  donations,
  files,
  fundingReceipts,
  mouPayments,
  projects,
  securityEvents,
  sharedMouGroups,
  sharedMouMemberships,
  sharedMouReceiptAllocations,
  sharedMouReceipts,
} from "@/lib/db/schema";
import { deleteObject, getObjectBuffer, headObject } from "@/lib/r2";
import { getWorkspaceSettings } from "@/lib/workspace/queries";
import {
  donationFileHash,
  MAX_DONATION_CSV_BYTES,
  parseDonationCsv,
  SensitiveDonationColumnsError,
} from "./csv";
import { classifyDonationRow, donationCandidateKey } from "./dedupe";

const allocationInput = z.object({
  projectId: z.string().uuid(),
  amount: z.coerce
    .number()
    .finite()
    .refine((value) => value !== 0),
  mouPaymentId: z.string().uuid().nullable().optional(),
  sharedMouGroupId: z.string().uuid().nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

const confirmInput = z.object({
  donationId: z.string().uuid(),
  allocations: z.array(allocationInput).min(1).max(100),
  reason: z.string().trim().max(500).nullable().optional(),
});

const unallocatedInput = z.object({
  donationId: z.string().uuid(),
  reason: z.string().trim().max(500).nullable().optional(),
});

const duplicateInput = z.object({
  donationId: z.string().uuid(),
  resolution: z.enum(["distinct", "duplicate"]),
  reason: z.string().trim().min(3).max(500),
});

const donationMouMatchInput = z.object({
  allocationId: z.string().uuid(),
  paymentId: z.string().uuid(),
});

function money(value: number): string {
  return value.toFixed(2);
}

function cents(value: string | number): number {
  return Math.round(Number(value) * 100);
}

async function revalidateDonationData(
  projectIds: string[] = [],
  groupIds: string[] = []
) {
  revalidatePath("/donations");
  if (projectIds.length > 0) {
    const rows = await db
      .select({ slug: projects.slug })
      .from(projects)
      .where(inArray(projects.id, [...new Set(projectIds)]));
    for (const row of rows) {
      revalidatePath(`/projects/${row.slug}/budget`);
      revalidatePath(`/projects/${row.slug}`);
    }
  }
  for (const groupId of new Set(groupIds)) {
    await reevaluateSharedMouPayments({ groupId });
    revalidatePath(`/agreements/${groupId}`);
  }
}

export type DonationImportResult = {
  importId?: string;
  newRows?: number;
  exactDuplicateRows?: number;
  possibleDuplicateRows?: number;
  failedRows?: number;
  alreadyImported?: boolean;
  error?: string;
};

/** Parse one uploaded monthly CSV and add only rows not seen before. */
export async function createDonationImportFromFile(
  fileId: string
): Promise<DonationImportResult> {
  const { user } = await requireDonationAdmin();
  const [file] = await db
    .select()
    .from(files)
    .where(eq(files.id, fileId))
    .limit(1);
  if (
    !file ||
    file.status !== "ready" ||
    file.purpose !== "donation_import" ||
    file.uploadedBy !== user.id
  ) {
    return { error: "The uploaded file is not ready. Try again." };
  }
  if (!file.originalName.toLowerCase().endsWith(".csv")) {
    return { error: "Choose a CSV file." };
  }
  if (
    file.sizeBytes <= 0 ||
    file.sizeBytes > MAX_DONATION_CSV_BYTES ||
    !["text/csv", "application/vnd.ms-excel"].includes(file.mimeType)
  ) {
    return { error: "The CSV is larger than 5 MB. Split it and try again." };
  }

  try {
    const actual = await headObject(file.r2Key);
    const actualType =
      actual.contentType?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
    if (
      actual.size <= 0 ||
      actual.size > MAX_DONATION_CSV_BYTES ||
      !["text/csv", "application/vnd.ms-excel"].includes(actualType) ||
      actualType !== file.mimeType
    ) {
      return { error: "The uploaded CSV could not be verified." };
    }
    const buffer = await getObjectBuffer(file.r2Key, {
      maxBytes: MAX_DONATION_CSV_BYTES,
    });
    const fileHash = donationFileHash(buffer);
    const [existingImport] = await db
      .select({ id: donationImports.id })
      .from(donationImports)
      .where(eq(donationImports.fileHash, fileHash))
      .limit(1);
    if (existingImport) {
      return {
        importId: existingImport.id,
        alreadyImported: true,
        error: "This exact file was already imported. No rows were added.",
      };
    }

    const parsed = parseDonationCsv(buffer.toString("utf8"));
    const workspace = await getWorkspaceSettings();
    const existing = await db
      .select({
        id: donations.id,
        rowFingerprint: donations.rowFingerprint,
        donorKey: donations.donorKey,
        amount: donations.amount,
        donationDate: donations.donationDate,
      })
      .from(donations);
    const dedupeState = {
      exactFingerprints: new Set(existing.map((row) => row.rowFingerprint)),
      possibleByDonorAmountDate: new Map<string, string>(
        existing.map((row) => [
          donationCandidateKey({
            rowFingerprint: row.rowFingerprint,
            donorKey: row.donorKey,
            amountCents: cents(row.amount),
            donationDate: row.donationDate,
          }),
          row.id,
        ])
      ),
    };

    let exactDuplicateRows = 0;
    let possibleDuplicateRows = 0;
    const newRows: Array<
      (typeof donations)["$inferInsert"] & { duplicateOfId: string | null }
    > = [];
    for (const row of parsed.successfulRows) {
      const id = randomUUID();
      const classification = classifyDonationRow(dedupeState, row, id);
      if (classification.kind === "exact_duplicate") {
        exactDuplicateRows += 1;
        continue;
      }
      const duplicateOfId = classification.duplicateOfId;
      if (duplicateOfId) possibleDuplicateRows += 1;
      newRows.push({
        id,
        importId: "",
        sourceRowNumber: row.sourceRowNumber,
        rowFingerprint: row.rowFingerprint,
        campaignExternalId: row.campaignExternalId,
        donor: row.donor,
        donorKey: row.donorKey,
        campaign: row.campaign,
        recurring: row.recurring,
        amount: money(row.amount),
        currency: workspace.defaultCurrency,
        paymentMethod: row.paymentMethod,
        sourceStatus: row.sourceStatus,
        donationDate: row.donationDate,
        sourceDateTime: row.sourceDateTime,
        notes: row.notes,
        reviewStatus: duplicateOfId ? "possible_duplicate" : "needs_review",
        duplicateOfId,
      });
    }

    const imported = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`donation-file:${file.id}`}))`
      );
      const [lockedFile] = await tx
        .select({ id: files.id })
        .from(files)
        .where(
          and(
            eq(files.id, file.id),
            eq(files.status, "ready"),
            eq(files.purpose, "donation_import"),
            eq(files.uploadedBy, user.id)
          )
        )
        .limit(1);
      if (!lockedFile) throw new Error("donation file unavailable");

      const [existingLocked] = await tx
        .select({ id: donationImports.id })
        .from(donationImports)
        .where(
          or(
            eq(donationImports.fileId, file.id),
            eq(donationImports.fileHash, fileHash)
          )
        )
        .limit(1);
      if (existingLocked) {
        return { batch: existingLocked, alreadyImported: true };
      }

      const [batch] = await tx
        .insert(donationImports)
        .values({
          fileId: file.id,
          sourceFilename: file.originalName,
          fileHash,
          currency: workspace.defaultCurrency,
          rowCount: parsed.rowCount,
          successfulRows: parsed.successfulRows.length,
          failedRows: parsed.failedRows,
          newRows: newRows.length,
          exactDuplicateRows,
          possibleDuplicateRows,
          successfulAmount: money(parsed.successfulAmount),
          createdBy: user.id,
          sourceRetentionUntil: new Date(
            Date.now() +
              workspace.donationSourceRetentionDays * 24 * 60 * 60 * 1000
          ),
        })
        .returning({ id: donationImports.id });
      if (newRows.length > 0) {
        await tx.insert(donations).values(
          newRows.map((row) => ({
            ...row,
            importId: batch.id,
          }))
        );
      }
      return { batch, alreadyImported: false };
    });
    if (imported.alreadyImported) {
      return {
        importId: imported.batch.id,
        alreadyImported: true,
        error: "This exact file was already imported. No rows were added.",
      };
    }
    revalidatePath("/donations");
    return {
      importId: imported.batch.id,
      newRows: newRows.length,
      exactDuplicateRows,
      possibleDuplicateRows,
      failedRows: parsed.failedRows,
    };
  } catch (error) {
    if (error instanceof SensitiveDonationColumnsError) {
      let objectDeleted = false;
      try {
        await deleteObject(file.r2Key);
        objectDeleted = true;
      } catch {
        // Keep the failed record so the daily cleanup can retry the deletion.
      }
      await db.transaction(async (tx) => {
        await tx.insert(securityEvents).values({
          actorId: user.id,
          event: "donation_upload_rejected_sensitive_columns",
          method: error.headers.join(", ").slice(0, 500),
        });
        if (objectDeleted) {
          await tx.delete(files).where(eq(files.id, file.id));
        } else {
          await tx
            .update(files)
            .set({ status: "failed" })
            .where(eq(files.id, file.id));
        }
      });
      return {
        error:
          "This CSV contains payment or identity columns Sastra does not accept. Export a reduced donation report and try again.",
      };
    }
    return {
      error: "Sastra could not read this CSV. Check the file and try again.",
    };
  }
}

type AllocationValue = z.infer<typeof allocationInput>;

async function currentAllocationSnapshot(donationId: string) {
  const rows = await db
    .select({
      projectId: donationAllocations.projectId,
      projectTitle: projects.title,
      amount: donationAllocations.amount,
      mouPaymentId: donationAllocations.mouPaymentId,
      sharedMouGroupId: donationAllocations.sharedMouGroupId,
    })
    .from(donationAllocations)
    .innerJoin(projects, eq(projects.id, donationAllocations.projectId))
    .where(eq(donationAllocations.donationId, donationId));
  return rows;
}

async function replaceDonationAllocations(input: {
  donationId: string;
  allocations: AllocationValue[];
  reason: string | null;
  actorId: string;
}) {
  const [donation] = await db
    .select()
    .from(donations)
    .where(eq(donations.id, input.donationId))
    .limit(1);
  if (!donation) return { error: "Donation not found." };
  if (
    donation.reviewStatus === "possible_duplicate" ||
    donation.reviewStatus === "duplicate"
  ) {
    return { error: "Resolve the duplicate warning before allocating this donation." };
  }

  const previous = await currentAllocationSnapshot(input.donationId);
  if (previous.length > 0 && !input.reason?.trim()) {
    return { error: "Add a reason before changing a posted allocation." };
  }
  const donationCents = cents(donation.amount);
  const nextCents = input.allocations.reduce(
    (sum, allocation) => sum + cents(allocation.amount),
    0
  );
  const hasWrongSign = input.allocations.some(
    (allocation) =>
      Math.sign(cents(allocation.amount)) !== Math.sign(donationCents)
  );
  if (hasWrongSign || Math.abs(nextCents) > Math.abs(donationCents)) {
    return {
      error:
        "Project amounts must use the donation's sign and cannot exceed its total.",
    };
  }

  const projectIds = [...new Set(input.allocations.map((row) => row.projectId))];
  const projectRows =
    projectIds.length === 0
      ? []
      : await db
          .select({ id: projects.id, title: projects.title })
          .from(projects)
          .where(inArray(projects.id, projectIds));
  if (projectRows.length !== projectIds.length) {
    return { error: "One of the selected projects no longer exists." };
  }
  const projectTitle = new Map(projectRows.map((row) => [row.id, row.title]));

  const oldAllocations = await db
    .select({
      fundingReceiptId: donationAllocations.fundingReceiptId,
      projectId: donationAllocations.projectId,
      mouPaymentId: donationAllocations.mouPaymentId,
      sharedMouGroupId: donationAllocations.sharedMouGroupId,
    })
    .from(donationAllocations)
    .where(eq(donationAllocations.donationId, input.donationId));
  const oldPaymentIds = new Set(
    oldAllocations
      .map((row) => row.mouPaymentId)
      .filter((id): id is string => Boolean(id))
  );
  const nextPaymentIds = [
    ...new Set(
      input.allocations
        .map((row) => row.mouPaymentId)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const payments =
    nextPaymentIds.length === 0
      ? []
      : await db
          .select()
          .from(mouPayments)
          .where(inArray(mouPayments.id, nextPaymentIds));
  if (payments.length !== nextPaymentIds.length) {
    return { error: "One of the matched MoU payments no longer exists." };
  }
  const paymentById = new Map(payments.map((payment) => [payment.id, payment]));
  for (const payment of payments.filter((row) => !row.sharedMouGroupId)) {
    if (
      input.allocations.filter(
        (allocation) => allocation.mouPaymentId === payment.id
      ).length !== 1
    ) {
      return { error: "Each project MoU payment can settle only one allocation." };
    }
  }
  for (const allocation of input.allocations) {
    if (!allocation.mouPaymentId) continue;
    const payment = paymentById.get(allocation.mouPaymentId)!;
    if (payment.paidAt && !oldPaymentIds.has(payment.id)) {
      return { error: "One of the matched MoU payments is already received." };
    }
    if (payment.currency !== donation.currency) {
      return { error: "The donation and matched MoU payment use different currencies." };
    }
    if (payment.sharedMouGroupId) {
      if (allocation.sharedMouGroupId !== payment.sharedMouGroupId) {
        return { error: "The shared MoU match is no longer valid." };
      }
    } else {
      if (allocation.sharedMouGroupId) {
        return { error: "This project payment is not part of a shared MoU." };
      }
      if (
        payment.projectId !== allocation.projectId ||
        cents(payment.amount) !== cents(allocation.amount)
      ) {
        return { error: "The allocation no longer matches the scheduled payment." };
      }
    }
  }

  const sharedPaymentIds = payments
    .filter((payment) => payment.sharedMouGroupId)
    .map((payment) => payment.id);
  const sharedMemberships =
    sharedPaymentIds.length === 0
      ? []
      : await db
          .select({
            id: sharedMouMemberships.id,
            groupId: sharedMouMemberships.groupId,
            projectId: sharedMouMemberships.projectId,
            amount: sharedMouMemberships.allocationAmount,
          })
          .from(sharedMouMemberships)
          .where(
            and(
              inArray(
                sharedMouMemberships.groupId,
                payments
                  .map((payment) => payment.sharedMouGroupId)
                  .filter((id): id is string => Boolean(id))
              ),
              eq(sharedMouMemberships.active, true)
            )
          );
  const membershipByGroup = new Map<string, typeof sharedMemberships>();
  for (const membership of sharedMemberships) {
    const list = membershipByGroup.get(membership.groupId) ?? [];
    list.push(membership);
    membershipByGroup.set(membership.groupId, list);
  }
  for (const paymentId of sharedPaymentIds) {
    const payment = paymentById.get(paymentId)!;
    const groupId = payment.sharedMouGroupId!;
    const memberships = membershipByGroup.get(groupId) ?? [];
    const expected = allocateSharedReceipt(
      payment.amount,
      memberships.map((membership) => ({
        projectId: membership.projectId,
        membershipId: membership.id,
        amount: membership.amount,
      }))
    );
    const provided = input.allocations.filter(
      (allocation) => allocation.mouPaymentId === paymentId
    );
    if (
      provided.length !== expected.length ||
      expected.some((row) => {
        const match = provided.find(
          (allocation) => allocation.projectId === row.projectId
        );
        return !match || cents(match.amount) !== cents(row.amount);
      })
    ) {
      return { error: "Use the reviewed project split for this shared MoU payment." };
    }
  }

  const nextSnapshot = input.allocations.map((allocation) => ({
    projectId: allocation.projectId,
    projectTitle: projectTitle.get(allocation.projectId) ?? "Project",
    amount: money(allocation.amount),
    mouPaymentId: allocation.mouPaymentId ?? null,
    sharedMouGroupId: allocation.sharedMouGroupId ?? null,
  }));
  const affectedProjectIds = [
    ...new Set([
      ...oldAllocations.map((row) => row.projectId),
      ...input.allocations.map((row) => row.projectId),
    ]),
  ];
  const affectedGroupIds = [
    ...new Set(
      [
        ...oldAllocations.map((row) => row.sharedMouGroupId),
        ...input.allocations.map((row) => row.sharedMouGroupId),
      ].filter((id): id is string => Boolean(id))
    ),
  ];

  await db.transaction(async (tx) => {
    const oldSharedPaymentIds = [
      ...new Set(
        oldAllocations
          .filter((row) => row.sharedMouGroupId)
          .map((row) => row.mouPaymentId)
          .filter((id): id is string => Boolean(id))
      ),
    ];
    const oldSharedReceipts =
      oldSharedPaymentIds.length === 0
        ? []
        : await tx
            .select({ id: sharedMouReceipts.id })
            .from(sharedMouReceipts)
            .where(inArray(sharedMouReceipts.paymentId, oldSharedPaymentIds));

    await tx
      .delete(donationAllocations)
      .where(eq(donationAllocations.donationId, input.donationId));
    if (oldSharedReceipts.length > 0) {
      const ids = oldSharedReceipts.map((row) => row.id);
      await tx
        .delete(sharedMouReceiptAllocations)
        .where(inArray(sharedMouReceiptAllocations.receiptId, ids));
      await tx.delete(sharedMouReceipts).where(inArray(sharedMouReceipts.id, ids));
    }
    if (oldAllocations.length > 0) {
      await tx
        .delete(fundingReceipts)
        .where(
          inArray(
            fundingReceipts.id,
            oldAllocations.map((row) => row.fundingReceiptId)
          )
        );
    }
    if (oldPaymentIds.size > 0) {
      await tx
        .update(mouPayments)
        .set({
          paidAt: null,
          receiptId: null,
          readinessStatus: "locked",
          readinessReason: "Payment not received.",
          readinessEvaluatedAt: new Date(),
        })
        .where(inArray(mouPayments.id, [...oldPaymentIds]));
    }

    const groupRows =
      sharedPaymentIds.length === 0
        ? []
        : await tx
            .select({
              id: sharedMouGroups.id,
              name: sharedMouGroups.name,
            })
            .from(sharedMouGroups)
            .where(
              inArray(
                sharedMouGroups.id,
                payments
                  .map((payment) => payment.sharedMouGroupId)
                  .filter((id): id is string => Boolean(id))
              )
            );
    const groupName = new Map(groupRows.map((row) => [row.id, row.name]));
    const sharedReceiptByPayment = new Map<string, string>();
    for (const payment of payments.filter((row) => row.sharedMouGroupId)) {
      const [receipt] = await tx
        .insert(sharedMouReceipts)
        .values({
          groupId: payment.sharedMouGroupId!,
          paymentId: payment.id,
          amount: payment.amount,
          actualNetAmount: payment.amount,
          currency: payment.currency,
          receivedDate: donation.donationDate,
          source: donation.donor,
          note:
            donation.notes ??
            `Imported donation for ${groupName.get(payment.sharedMouGroupId!) ?? "shared MoU"}.`,
          recordedBy: input.actorId,
        })
        .returning({ id: sharedMouReceipts.id });
      sharedReceiptByPayment.set(payment.id, receipt.id);
    }

    for (const allocation of input.allocations) {
      const [receipt] = await tx
        .insert(fundingReceipts)
        .values({
          projectId: allocation.projectId,
          amount: money(allocation.amount),
          expectedNetAmount: money(allocation.amount),
          actualNetAmount: money(allocation.amount),
          currency: donation.currency,
          receivedDate: donation.donationDate,
          source: donation.donor,
          note:
            donation.notes ??
            `Allocated from donation imported in row ${donation.sourceRowNumber}.`,
          recordedBy: input.actorId,
        })
        .returning({ id: fundingReceipts.id });
      await tx.insert(donationAllocations).values({
        donationId: donation.id,
        projectId: allocation.projectId,
        fundingReceiptId: receipt.id,
        mouPaymentId: allocation.mouPaymentId ?? null,
        sharedMouGroupId: allocation.sharedMouGroupId ?? null,
        amount: money(allocation.amount),
        note: allocation.note ?? null,
        createdBy: input.actorId,
      });

      if (allocation.mouPaymentId && allocation.sharedMouGroupId) {
        const membership = (membershipByGroup.get(allocation.sharedMouGroupId) ?? []).find(
          (row) => row.projectId === allocation.projectId
        );
        const sharedReceiptId = sharedReceiptByPayment.get(allocation.mouPaymentId);
        if (membership && sharedReceiptId) {
          await tx.insert(sharedMouReceiptAllocations).values({
            receiptId: sharedReceiptId,
            membershipId: membership.id,
            projectId: allocation.projectId,
            fundingReceiptId: receipt.id,
            amount: money(allocation.amount),
            actualNetAmount: money(allocation.amount),
          });
        }
      } else if (allocation.mouPaymentId) {
        await tx
          .update(mouPayments)
          .set({
            paidAt: new Date(`${donation.donationDate}T12:00:00.000Z`),
            receiptId: receipt.id,
            readinessStatus: "received",
            readinessReason: "Payment received.",
            readinessEvaluatedAt: new Date(),
          })
          .where(eq(mouPayments.id, allocation.mouPaymentId));
      }
    }
    if (sharedPaymentIds.length > 0) {
      await tx
        .update(mouPayments)
        .set({
          paidAt: new Date(`${donation.donationDate}T12:00:00.000Z`),
          readinessStatus: "received",
          readinessReason: "Payment received.",
          readinessEvaluatedAt: new Date(),
        })
        .where(inArray(mouPayments.id, sharedPaymentIds));
    }

    const nextStatus =
      nextCents === 0
        ? "unallocated"
        : nextCents === donationCents
          ? "allocated"
          : "partially_allocated";
    await tx
      .update(donations)
      .set({
        reviewStatus: nextStatus,
        reviewedBy: input.actorId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(donations.id, donation.id));
    await tx.insert(donationReviews).values({
      donationId: donation.id,
      action:
        previous.length === 0
          ? nextCents === 0
            ? "kept_unallocated"
            : "allocated"
          : "allocation_corrected",
      previousAllocations: previous,
      nextAllocations: nextSnapshot,
      reason: input.reason,
      actorId: input.actorId,
    });
  });

  await revalidateDonationData(affectedProjectIds, affectedGroupIds);
  return {};
}

/** Post a reviewed one-project or multi-project allocation. */
export async function confirmDonationAllocations(
  input: z.input<typeof confirmInput>
): Promise<{ error?: string }> {
  const { user } = await requireDonationAdmin();
  const parsed = confirmInput.safeParse(input);
  if (!parsed.success) return { error: "Check the allocation amounts and try again." };
  return replaceDonationAllocations({
    ...parsed.data,
    reason: parsed.data.reason ?? null,
    actorId: user.id,
  });
}

/** Link an existing reviewed donation receipt to one exact unpaid MoU payment. */
export async function confirmDonationMouPaymentMatch(
  input: z.input<typeof donationMouMatchInput>
): Promise<{ error?: string }> {
  const { user } = await requireDonationAdmin();
  const parsed = donationMouMatchInput.safeParse(input);
  if (!parsed.success) return { error: "This MoU match is no longer valid." };

  try {
    const projectId = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`donation-mou:${parsed.data.allocationId}`}))`
      );
      const [match] = await tx
        .select({
          donationId: donationAllocations.donationId,
          allocationProjectId: donationAllocations.projectId,
          allocationAmount: donationAllocations.amount,
          currentPaymentId: donationAllocations.mouPaymentId,
          receiptId: donationAllocations.fundingReceiptId,
          receiptProjectId: fundingReceipts.projectId,
          receiptAmount: fundingReceipts.amount,
          receiptCurrency: fundingReceipts.currency,
          donationCurrency: donations.currency,
          donationDate: donations.donationDate,
          paymentProjectId: mouPayments.projectId,
          paymentAmount: mouPayments.amount,
          paymentCurrency: mouPayments.currency,
          paymentPaidAt: mouPayments.paidAt,
          paymentReceiptId: mouPayments.receiptId,
          sharedMouGroupId: mouPayments.sharedMouGroupId,
        })
        .from(donationAllocations)
        .innerJoin(
          fundingReceipts,
          eq(fundingReceipts.id, donationAllocations.fundingReceiptId)
        )
        .innerJoin(donations, eq(donations.id, donationAllocations.donationId))
        .innerJoin(mouPayments, eq(mouPayments.id, parsed.data.paymentId))
        .innerJoin(projects, eq(projects.id, donationAllocations.projectId))
        .where(eq(donationAllocations.id, parsed.data.allocationId))
        .limit(1);

      if (!match) throw new Error("The donation allocation was not found.");
      if (
        match.currentPaymentId === parsed.data.paymentId &&
        match.paymentReceiptId === match.receiptId
      ) {
        return match.allocationProjectId;
      }
      if (match.currentPaymentId) {
        throw new Error("This donation is already linked to an MoU payment.");
      }
      if (match.paymentPaidAt) {
        throw new Error("This MoU payment is already marked received.");
      }
      if (match.sharedMouGroupId) {
        throw new Error("Shared MoU payments must be reviewed from Donations.");
      }
      if (
        match.allocationProjectId !== match.paymentProjectId ||
        match.receiptProjectId !== match.paymentProjectId ||
        cents(match.allocationAmount) !== cents(match.paymentAmount) ||
        cents(match.receiptAmount) !== cents(match.paymentAmount) ||
        match.donationCurrency !== match.paymentCurrency ||
        match.receiptCurrency !== match.paymentCurrency
      ) {
        throw new Error(
          "The donation no longer exactly matches this project's MoU payment."
        );
      }

      const previousAllocations = await tx
        .select({
          allocationId: donationAllocations.id,
          projectId: donationAllocations.projectId,
          projectTitle: projects.title,
          amount: donationAllocations.amount,
          mouPaymentId: donationAllocations.mouPaymentId,
          sharedMouGroupId: donationAllocations.sharedMouGroupId,
        })
        .from(donationAllocations)
        .innerJoin(projects, eq(projects.id, donationAllocations.projectId))
        .where(eq(donationAllocations.donationId, match.donationId));

      const [updatedPayment] = await tx
        .update(mouPayments)
        .set({
          paidAt: new Date(`${match.donationDate}T12:00:00.000Z`),
          receiptId: match.receiptId,
          readinessStatus: "received",
          readinessReason: "Payment received.",
          readinessEvaluatedAt: new Date(),
        })
        .where(
          and(
            eq(mouPayments.id, parsed.data.paymentId),
            isNull(mouPayments.paidAt)
          )
        )
        .returning({ id: mouPayments.id });
      if (!updatedPayment) {
        throw new Error("This MoU payment was received by another update.");
      }

      const [updatedAllocation] = await tx
        .update(donationAllocations)
        .set({ mouPaymentId: parsed.data.paymentId })
        .where(
          and(
            eq(donationAllocations.id, parsed.data.allocationId),
            isNull(donationAllocations.mouPaymentId)
          )
        )
        .returning({ id: donationAllocations.id });
      if (!updatedAllocation)
        throw new Error("This donation allocation was changed by another update.");

      await tx.insert(donationReviews).values({
        donationId: match.donationId,
        action: "mou_payment_reconciled",
        previousAllocations: previousAllocations.map((allocation) => ({
          projectId: allocation.projectId,
          projectTitle: allocation.projectTitle,
          amount: allocation.amount,
          mouPaymentId: allocation.mouPaymentId,
          sharedMouGroupId: allocation.sharedMouGroupId,
        })),
        nextAllocations: previousAllocations.map(
          ({ allocationId, ...allocation }) =>
            allocationId === parsed.data.allocationId
              ? { ...allocation, mouPaymentId: parsed.data.paymentId }
              : allocation
        ),
        reason: "Exact project, amount, and currency match confirmed from Budget.",
        actorId: user.id,
      });
      return match.allocationProjectId;
    });

    await revalidateDonationData([projectId]);
    return {};
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Sastra could not apply this MoU match.",
    };
  }
}

/** Finish review without assigning the remaining donation to a project. */
export async function setDonationUnallocated(
  input: z.input<typeof unallocatedInput>
): Promise<{ error?: string }> {
  const { user } = await requireDonationAdmin();
  const parsed = unallocatedInput.safeParse(input);
  if (!parsed.success) return { error: "Could not update this donation." };
  return replaceDonationAllocations({
    donationId: parsed.data.donationId,
    allocations: [],
    reason: parsed.data.reason ?? null,
    actorId: user.id,
  });
}

/** Resolve a same-day, same-donor, same-amount duplicate warning. */
export async function resolveDonationDuplicate(
  input: z.input<typeof duplicateInput>
): Promise<{ error?: string }> {
  const { user } = await requireDonationAdmin();
  const parsed = duplicateInput.safeParse(input);
  if (!parsed.success) {
    return { error: "Add a short reason for this duplicate decision." };
  }
  const [donation] = await db
    .select({
      id: donations.id,
      status: donations.reviewStatus,
    })
    .from(donations)
    .where(eq(donations.id, parsed.data.donationId))
    .limit(1);
  if (!donation) return { error: "Donation not found." };
  if (donation.status !== "possible_duplicate") return {};

  await db.transaction(async (tx) => {
    await tx
      .update(donations)
      .set({
        reviewStatus:
          parsed.data.resolution === "distinct" ? "needs_review" : "duplicate",
        duplicateResolutionNote: parsed.data.reason,
        reviewedBy: user.id,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(donations.id, donation.id));
    await tx.insert(donationReviews).values({
      donationId: donation.id,
      action:
        parsed.data.resolution === "distinct"
          ? "duplicate_dismissed"
          : "confirmed_duplicate",
      reason: parsed.data.reason,
      actorId: user.id,
    });
  });
  revalidatePath("/donations");
  return {};
}
