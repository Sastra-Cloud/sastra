"use server";

import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { allocateSharedReceipt } from "@/lib/agreements/readiness";
import { reevaluateSharedMouPayments } from "@/lib/agreements/readiness-engine";
import { requireDonationAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import {
  donationAllocations,
  donationReviews,
  donations,
  fundingReceipts,
  invoices,
  mouPayments,
  projects,
  sharedMouGroups,
  sharedMouMemberships,
  sharedMouReceiptAllocations,
  sharedMouReceipts,
  sponsorships,
  sponsorshipReceipts,
  sponsorshipReceiptAllocations,
} from "@/lib/db/schema";
import { parseDonationTable } from "./csv";
import {
  buildDonationCsvProposal,
  donationCsvErrorResult,
  findDonationCsvFormat,
  isLoadedDonationCsv,
  loadDonationCsv,
  markDonationCsvFormatUsed,
  recordDonationImport,
} from "./import-ledger";
import { prepareDonationInvoicePosting, restoreDonationInvoiceStatus } from "./invoice-posting";
import type { DonationImportResult } from "./types";

const allocationInput = z.object({
  projectId: z.string().uuid(),
  amount: z.coerce
    .number()
    .finite()
    .refine((value) => value !== 0),
  mouPaymentId: z.string().uuid().nullable().optional(),
  sharedMouGroupId: z.string().uuid().nullable().optional(),
  invoiceId: z.string().uuid().nullable().optional(),
  actualNetAmount: z.coerce.number().finite().nonnegative().nullable().optional(),
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

const duplicateInput = z
  .object({
    donationId: z.string().uuid(),
    resolution: z.enum(["distinct", "duplicate"]),
    reason: z.string().trim().max(500).optional(),
  })
  // A repeat gift is rare, so only keeping the row as a new gift needs a reason.
  .refine(
    (input) =>
      input.resolution === "duplicate" || (input.reason ?? "").length >= 3,
    { path: ["reason"] }
  );

const bulkDonationIds = z.array(z.string().uuid()).min(1).max(500);

const bulkDuplicateInput = z.object({
  donationIds: bulkDonationIds,
  reason: z.string().trim().max(500).optional(),
});

const bulkUnallocatedInput = z.object({
  donationIds: bulkDonationIds,
  reason: z.string().trim().max(500).nullable().optional(),
});

const DEFAULT_DUPLICATE_REASON =
  "Same donor, amount, and date as a donation already in Sastra.";

const donationMouMatchInput = z.object({
  allocationId: z.string().uuid(),
  paymentId: z.string().uuid(),
  expectedPaymentAmount: z.coerce.number().finite().positive().optional(),
  expectedReceiptAmount: z.coerce.number().finite().positive().optional(),
  differenceReason: z.string().trim().max(500).optional(),
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

/** Parse one uploaded CSV and add only rows not seen before. */
export async function createDonationImportFromFile(
  fileId: string
): Promise<DonationImportResult> {
  const { user } = await requireDonationAdmin();
  const loaded = await loadDonationCsv(fileId, user.id);
  if (!isLoadedDonationCsv(loaded)) return loaded;

  try {
    const format = await findDonationCsvFormat(loaded.table.headers);
    if (!format) {
      return { needsFormat: await buildDonationCsvProposal(loaded) };
    }
    const parsed = parseDonationTable(loaded.table, format.mapping, {
      currency: loaded.currency,
    });
    const result = await recordDonationImport({
      loaded,
      parsed,
      formatName: format.name,
      userId: user.id,
    });
    if (format.id && !result.error) {
      await markDonationCsvFormatUsed(format.id);
    }
    return result;
  } catch (error) {
    return donationCsvErrorResult(error);
  }
}

type AllocationValue = z.infer<typeof allocationInput>;

async function currentAllocationSnapshot(donationId: string, client: Pick<typeof db, "select"> = db) {
  const rows = await client
    .select({
      projectId: donationAllocations.projectId,
      projectTitle: projects.title,
      amount: donationAllocations.amount,
      mouPaymentId: donationAllocations.mouPaymentId,
      sharedMouGroupId: donationAllocations.sharedMouGroupId,
      invoiceId: donationAllocations.invoiceId,
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
  const result = await db.transaction(async (tx) => {
    const [donation] = await tx
      .select()
      .from(donations)
      .where(eq(donations.id, input.donationId))
      .limit(1).for("update");
    if (!donation) return { error: "Donation not found." };
    if (
      donation.reviewStatus === "possible_duplicate" ||
      donation.reviewStatus === "duplicate"
    ) {
      return { error: "Resolve the duplicate warning before allocating this donation." };
    }

    const previous = await currentAllocationSnapshot(input.donationId, tx);
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
        : await tx
            .select({ id: projects.id, title: projects.title })
            .from(projects)
            .where(inArray(projects.id, projectIds));
    if (projectRows.length !== projectIds.length) {
      return { error: "One of the selected projects no longer exists." };
    }
    const projectTitle = new Map(projectRows.map((row) => [row.id, row.title]));

    const oldAllocations = await tx
      .select({
        fundingReceiptId: donationAllocations.fundingReceiptId,
        sponsorshipReceiptId: donationAllocations.sponsorshipReceiptId,
        invoiceId: donationAllocations.invoiceId,
        projectId: donationAllocations.projectId,
        mouPaymentId: donationAllocations.mouPaymentId,
        sharedMouGroupId: donationAllocations.sharedMouGroupId,
      })
      .from(donationAllocations)
      .where(eq(donationAllocations.donationId, input.donationId));
    const invoicePlan = await prepareDonationInvoicePosting(tx, donation.currency, input.allocations, oldAllocations);
    if ("error" in invoicePlan) return { error: invoicePlan.error };
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
        : await tx
            .select()
            .from(mouPayments)
            .where(inArray(mouPayments.id, nextPaymentIds)).orderBy(asc(mouPayments.id)).for("update");
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
        : await tx
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
      invoiceId: allocation.invoiceId ?? null,
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
    if (oldAllocations.some(row => row.fundingReceiptId)) {
      await tx
        .delete(fundingReceipts)
        .where(
          inArray(
            fundingReceipts.id,
            oldAllocations.map((row) => row.fundingReceiptId).filter((id): id is string => Boolean(id))
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
    for (const receipt of invoicePlan.oldReceipts) {
      await tx.update(sponsorshipReceipts).set({ reversedAt: new Date(), reversedBy: input.actorId, reversalReason: input.reason }).where(eq(sponsorshipReceipts.id, receipt.id));
    }
    await restoreDonationInvoiceStatus(tx, oldAllocations.map(row => row.invoiceId).filter((id): id is string => Boolean(id)));
    const sponsorReceiptByInvoice = new Map<string, string>();
    for (const invoice of invoicePlan.invoices.filter(row => row.sponsorshipId)) {
      const rows = input.allocations.filter(row => row.invoiceId === invoice.id);
      if (!rows.length) continue;
      const receiptId = randomUUID();
      await tx.insert(sponsorshipReceipts).values({ id: receiptId, sponsorshipId: invoice.sponsorshipId!, invoiceId: invoice.id,
        amount: money(rows.reduce((sum, row) => sum + row.amount, 0)),
        actualNetAmount: money(rows.reduce((sum, row) => sum + (row.actualNetAmount ?? row.amount), 0)),
        receivedDate: donation.donationDate, note: donation.notes, recordedBy: input.actorId });
      sponsorReceiptByInvoice.set(invoice.id, receiptId);
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
      const sponsorReceiptId = allocation.invoiceId ? sponsorReceiptByInvoice.get(allocation.invoiceId) : null;
      if (sponsorReceiptId) {
        await tx.insert(sponsorshipReceiptAllocations).values({ receiptId: sponsorReceiptId, projectId: allocation.projectId, amount: money(allocation.amount), actualNetAmount: money(allocation.actualNetAmount ?? allocation.amount) });
        await tx.insert(donationAllocations).values({ donationId: donation.id, projectId: allocation.projectId, sponsorshipReceiptId: sponsorReceiptId, invoiceId: allocation.invoiceId,
          amount: money(allocation.amount), note: allocation.note ?? null, createdBy: input.actorId });
        continue;
      }
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
        invoiceId: allocation.invoiceId ?? null,
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
    const receivedInvoiceIds = invoicePlan.candidates.filter(invoice => input.allocations.filter(row => row.invoiceId === invoice.id).reduce((sum, row) => sum + cents(row.amount), 0) === invoice.amountCents).map(invoice => invoice.id);
    if (receivedInvoiceIds.length) await tx.update(invoices).set({ status: "received" }).where(inArray(invoices.id, receivedInvoiceIds));
    for (const invoice of invoicePlan.invoices.filter(row => row.sponsorshipId)) {
      await tx.update(sponsorships).set({ updatedAt: new Date() }).where(eq(sponsorships.id, invoice.sponsorshipId!));
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
    return { affectedProjectIds, affectedGroupIds, sponsorshipIds: invoicePlan.invoices.map(row => row.sponsorshipId).filter((id): id is string => Boolean(id)) };
  });
  if ("error" in result) return { error: result.error };
  await revalidateDonationData(result.affectedProjectIds, result.affectedGroupIds);
  revalidatePath("/sponsorships");
  for (const id of result.sponsorshipIds) revalidatePath(`/sponsorships/${id}`);
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

/** Link an existing donation receipt after reviewing any difference from the schedule. */
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
          allocationInvoiceId: donationAllocations.invoiceId,
          allocationSharedGroupId: donationAllocations.sharedMouGroupId,
          receiptId: donationAllocations.fundingReceiptId,
          receiptProjectId: fundingReceipts.projectId,
          receiptPrintRunId: fundingReceipts.printRunId,
          receiptAmount: fundingReceipts.amount,
          receiptCurrency: fundingReceipts.currency,
          donationCurrency: donations.currency,
          donationDate: donations.donationDate,
          paymentProjectId: mouPayments.projectId,
          paymentPrintRunId: mouPayments.printRunId,
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
      if (match.paymentPaidAt || match.paymentReceiptId) {
        throw new Error("This MoU payment is already marked received.");
      }
      if (match.sharedMouGroupId || match.allocationSharedGroupId) {
        throw new Error("Shared MoU payments must be reviewed from Donations.");
      }
      if (match.allocationInvoiceId) {
        throw new Error("This donation already has an invoice match. Review it from Donations.");
      }
      if (
        match.allocationProjectId !== match.paymentProjectId ||
        match.receiptProjectId !== match.paymentProjectId ||
        match.receiptPrintRunId !== match.paymentPrintRunId ||
        cents(match.allocationAmount) !== cents(match.receiptAmount) ||
        cents(match.receiptAmount) <= 0 ||
        cents(match.paymentAmount) <= 0 ||
        match.donationCurrency !== match.paymentCurrency ||
        match.receiptCurrency !== match.paymentCurrency
      ) {
        throw new Error(
          "Choose an unpaid payment for the same project, print run, and currency."
        );
      }
      if (
        (parsed.data.expectedPaymentAmount !== undefined &&
          cents(parsed.data.expectedPaymentAmount) !== cents(match.paymentAmount)) ||
        (parsed.data.expectedReceiptAmount !== undefined &&
          cents(parsed.data.expectedReceiptAmount) !== cents(match.receiptAmount))
      ) {
        throw new Error("An amount changed. Refresh the page and review the link again.");
      }
      const differenceCents = cents(match.receiptAmount) - cents(match.paymentAmount);
      if (differenceCents !== 0 && (
        parsed.data.expectedPaymentAmount === undefined ||
        parsed.data.expectedReceiptAmount === undefined ||
        (parsed.data.differenceReason?.length ?? 0) < 3
      )) {
        throw new Error("Review both amounts and explain the difference before confirming.");
      }

      const previousAllocations = await tx
        .select({
          allocationId: donationAllocations.id,
          projectId: donationAllocations.projectId,
          projectTitle: projects.title,
          amount: donationAllocations.amount,
          mouPaymentId: donationAllocations.mouPaymentId,
          sharedMouGroupId: donationAllocations.sharedMouGroupId,
          invoiceId: donationAllocations.invoiceId,
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
            isNull(mouPayments.paidAt),
            isNull(mouPayments.receiptId)
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
          invoiceId: allocation.invoiceId,
        })),
        nextAllocations: previousAllocations.map(
          ({ allocationId, ...allocation }) =>
            allocationId === parsed.data.allocationId
              ? { ...allocation, mouPaymentId: parsed.data.paymentId }
              : allocation
        ),
        reason: differenceCents === 0
          ? "Exact project, amount, and currency match confirmed from Budget."
          : `Different amount confirmed from Budget. Scheduled ${match.paymentCurrency} ${match.paymentAmount}; received ${match.receiptCurrency} ${match.receiptAmount}; difference ${money(differenceCents / 100)}. ${parsed.data.differenceReason}`,
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
    return { error: "Add a short reason why this is a separate gift." };
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
  const reason = parsed.data.reason || DEFAULT_DUPLICATE_REASON;

  await db.transaction(async (tx) => {
    await tx
      .update(donations)
      .set({
        reviewStatus:
          parsed.data.resolution === "distinct" ? "needs_review" : "duplicate",
        duplicateResolutionNote: reason,
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
      reason,
      actorId: user.id,
    });
  });
  revalidatePath("/donations");
  return {};
}

/**
 * Confirm many possible duplicates at once. Rows that are no longer possible
 * duplicates are skipped, so a stale selection cannot change other rows.
 */
export async function resolveDonationDuplicates(
  input: z.input<typeof bulkDuplicateInput>
): Promise<{ resolved?: number; skipped?: number; error?: string }> {
  const { user } = await requireDonationAdmin();
  const parsed = bulkDuplicateInput.safeParse(input);
  if (!parsed.success) return { error: "Choose the donations again." };
  const ids = [...new Set(parsed.data.donationIds)];
  const reason = parsed.data.reason || DEFAULT_DUPLICATE_REASON;
  const now = new Date();
  const resolved = await db.transaction(async (tx) => {
    const rows = await tx
      .update(donations)
      .set({
        reviewStatus: "duplicate",
        duplicateResolutionNote: reason,
        reviewedBy: user.id,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          inArray(donations.id, ids),
          eq(donations.reviewStatus, "possible_duplicate")
        )
      )
      .returning({ id: donations.id });
    if (rows.length > 0) {
      await tx.insert(donationReviews).values(
        rows.map((row) => ({
          donationId: row.id,
          action: "confirmed_duplicate",
          reason,
          actorId: user.id,
        }))
      );
    }
    return rows.length;
  });
  revalidatePath("/donations");
  return { resolved, skipped: ids.length - resolved };
}

/** Undo confirmed duplicates: they return to the duplicate review queue. */
export async function reopenDonationDuplicates(
  input: z.input<typeof bulkDuplicateInput>
): Promise<{ reopened?: number; error?: string }> {
  const { user } = await requireDonationAdmin();
  const parsed = bulkDuplicateInput.safeParse(input);
  if (!parsed.success) return { error: "Choose the donations again." };
  const ids = [...new Set(parsed.data.donationIds)];
  const now = new Date();
  const reopened = await db.transaction(async (tx) => {
    const rows = await tx
      .update(donations)
      .set({
        reviewStatus: "possible_duplicate",
        duplicateResolutionNote: null,
        reviewedBy: user.id,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(
        and(inArray(donations.id, ids), eq(donations.reviewStatus, "duplicate"))
      )
      .returning({ id: donations.id });
    if (rows.length > 0) {
      await tx.insert(donationReviews).values(
        rows.map((row) => ({
          donationId: row.id,
          action: "duplicate_reopened",
          reason: "Duplicate decision undone.",
          actorId: user.id,
        }))
      );
    }
    return rows.length;
  });
  revalidatePath("/donations");
  return { reopened };
}

/**
 * Keep many unreviewed donations as received money without a project. Only
 * rows still waiting for review with no project links change.
 */
export async function setDonationsUnallocated(
  input: z.input<typeof bulkUnallocatedInput>
): Promise<{ updated?: number; skipped?: number; error?: string }> {
  const { user } = await requireDonationAdmin();
  const parsed = bulkUnallocatedInput.safeParse(input);
  if (!parsed.success) return { error: "Choose the donations again." };
  const ids = [...new Set(parsed.data.donationIds)];
  const linked = await db
    .select({ donationId: donationAllocations.donationId })
    .from(donationAllocations)
    .where(inArray(donationAllocations.donationId, ids));
  const linkedIds = new Set(linked.map((row) => row.donationId));
  const waiting = await db
    .select({ id: donations.id })
    .from(donations)
    .where(
      and(inArray(donations.id, ids), eq(donations.reviewStatus, "needs_review"))
    );
  let updated = 0;
  for (const row of waiting) {
    if (linkedIds.has(row.id)) continue;
    const result = await replaceDonationAllocations({
      donationId: row.id,
      allocations: [],
      reason: parsed.data.reason ?? null,
      actorId: user.id,
    });
    if (!result.error) updated += 1;
  }
  revalidatePath("/donations");
  return { updated, skipped: ids.length - updated };
}
