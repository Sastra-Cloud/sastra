import "server-only";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  donationAllocations,
  invoiceDeliveries,
  invoices,
  mouPayments,
  projects,
  sharedMouMemberships,
  sponsorshipFundUses,
  sponsorshipReceiptAllocations,
  sponsorshipReceipts,
  sponsorships,
} from "@/lib/db/schema";
import { requireWorkspaceModule } from "@/lib/workspace/module-guard";
import { donationInvoiceCandidates } from "./invoice-match";
import { allocateSponsorshipCents } from "@/lib/sponsorships/compute";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Allocation = {
  projectId: string;
  amount: number;
  invoiceId?: string | null;
  mouPaymentId?: string | null;
  sharedMouGroupId?: string | null;
  actualNetAmount?: number | null;
};
type OldAllocation = {
  invoiceId: string | null;
  sponsorshipReceiptId: string | null;
};
const cents = (value: string | number) => Math.round(Number(value) * 100);

/** Lock and validate all invoice balances before any funding ledger changes. */
export async function prepareDonationInvoicePosting(
  tx: Tx,
  currency: string,
  allocations: Allocation[],
  old: OldAllocation[]
) {
  const ids = [
    ...new Set(
      [
        ...allocations.map((row) => row.invoiceId),
        ...old.map((row) => row.invoiceId),
      ].filter((id): id is string => Boolean(id))
    ),
  ].sort();
  const oldReceiptIds = [
    ...new Set(
      old
        .map((row) => row.sponsorshipReceiptId)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  if (!ids.length) return { invoices: [], oldReceipts: [], candidates: [] };
  const found = await tx
    .select()
    .from(invoices)
    .where(inArray(invoices.id, ids));
  if (found.length !== ids.length)
    return {
      error: "An invoice no longer exists. Refresh and review the match.",
    };
  const sponsorIds = [
    ...new Set(
      found
        .map((row) => row.sponsorshipId)
        .filter((id): id is string => Boolean(id))
    ),
  ].sort();
  if (sponsorIds.length) await requireWorkspaceModule("sponsorships");
  // Sponsorship actions use this same lock, including fund uses and corrections.
  const sponsors = sponsorIds.length
    ? await tx
        .select()
        .from(sponsorships)
        .where(inArray(sponsorships.id, sponsorIds))
        .orderBy(asc(sponsorships.id))
        .for("update")
    : [];
  const locked = await tx
    .select()
    .from(invoices)
    .where(inArray(invoices.id, ids))
    .orderBy(asc(invoices.id))
    .for("update");
  const oldReceipts = oldReceiptIds.length
    ? await tx
        .select()
        .from(sponsorshipReceipts)
        .where(inArray(sponsorshipReceipts.id, oldReceiptIds))
        .for("update")
    : [];
  if (oldReceipts.some((row) => row.reversedAt))
    return {
      error:
        "A linked payment changed. Refresh and review the funding history.",
    };
  const received = sponsorIds.length
    ? await tx
        .select({
          receiptId: sponsorshipReceipts.id,
          invoiceId: sponsorshipReceipts.invoiceId,
          sponsorshipId: sponsorshipReceipts.sponsorshipId,
          projectId: sponsorshipReceiptAllocations.projectId,
          amount: sponsorshipReceiptAllocations.amount,
          net: sponsorshipReceiptAllocations.actualNetAmount,
        })
        .from(sponsorshipReceiptAllocations)
        .innerJoin(
          sponsorshipReceipts,
          eq(sponsorshipReceipts.id, sponsorshipReceiptAllocations.receiptId)
        )
        .where(
          and(
            inArray(sponsorshipReceipts.sponsorshipId, sponsorIds),
            isNull(sponsorshipReceipts.reversedAt)
          )
        )
    : [];
  const uses = sponsorIds.length
    ? await tx
        .select()
        .from(sponsorshipFundUses)
        .where(
          and(
            inArray(sponsorshipFundUses.sponsorshipId, sponsorIds),
            isNull(sponsorshipFundUses.reversedAt)
          )
        )
    : [];
  for (const removed of received.filter((row) =>
    oldReceiptIds.includes(row.receiptId)
  )) {
    const kept = received
      .filter(
        (row) =>
          row.sponsorshipId === removed.sponsorshipId &&
          row.projectId === removed.projectId &&
          !oldReceiptIds.includes(row.receiptId)
      )
      .reduce((sum, row) => sum + cents(row.net), 0);
    const spent = uses
      .filter(
        (row) =>
          row.sponsorshipId === removed.sponsorshipId &&
          row.projectId === removed.projectId
      )
      .reduce((sum, row) => sum + cents(row.amount), 0);
    // Include the replacement net share, so ordinary corrections remain possible.
    const replacement = allocations
      .filter(
        (row) =>
          found.find((invoice) => invoice.id === row.invoiceId)
            ?.sponsorshipId === removed.sponsorshipId &&
          row.projectId === removed.projectId
      )
      .reduce((sum, row) => sum + cents(row.actualNetAmount ?? row.amount), 0);
    if (kept + replacement < spent)
      return {
        error:
          "Some sponsorship funds were used. Reverse the related uses before removing these funds.",
      };
  }
  const paymentIds = [
    ...new Set(
      locked
        .map((row) => row.mouPaymentId)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const payments = paymentIds.length
    ? await tx
        .select()
        .from(mouPayments)
        .where(inArray(mouPayments.id, paymentIds))
        .orderBy(asc(mouPayments.id))
        .for("update")
    : [];
  const members = await tx
    .select()
    .from(sharedMouMemberships)
    .where(eq(sharedMouMemberships.active, true));
  const membersByGroup = new Map<
    string,
    Array<{ projectId: string; allocationCents: number }>
  >();
  for (const member of members)
    membersByGroup.set(member.groupId, [
      ...(membersByGroup.get(member.groupId) ?? []),
      {
        projectId: member.projectId,
        allocationCents: cents(member.allocationAmount),
      },
    ]);
  const titles = await tx
    .select({ id: projects.id, title: projects.title })
    .from(projects);
  const oldInvoiceIds = new Set(old.map((row) => row.invoiceId));
  const candidates = donationInvoiceCandidates(
    locked.map((invoice) => ({
      ...invoice,
      // Only this donation's existing invoice may already be received.
      status:
        oldInvoiceIds.has(invoice.id) &&
        ["issued", "sent", "received"].includes(invoice.status)
          ? "sent"
          : invoice.status,
      paidAt: oldInvoiceIds.has(invoice.id)
        ? null
        : (payments.find((row) => row.id === invoice.mouPaymentId)?.paidAt ??
          null),
      deductionBps:
        sponsors.find((row) => row.id === invoice.sponsorshipId)
          ?.deductionBps ?? null,
    })),
    new Map(titles.map((row) => [row.id, row.title])),
    membersByGroup,
    received.filter((row) => !oldReceiptIds.includes(row.receiptId))
  );
  for (const id of new Set(
    allocations.map((row) => row.invoiceId).filter(Boolean)
  )) {
    const candidate = candidates.find((row) => row.id === id);
    const provided = allocations.filter((row) => row.invoiceId === id);
    const providedTotal = provided.reduce(
      (sum, row) => sum + cents(row.amount),
      0
    );
    if (
      !candidate ||
      providedTotal <= 0 ||
      providedTotal > candidate.amountCents
    )
      return {
        error: "The invoice balance changed. Refresh and review the match.",
      };
    const expectedShares = candidate.sponsorshipId
      ? allocateSponsorshipCents(
          providedTotal,
          candidate.allocations.map((row) => ({
            projectId: row.projectId,
            cents: row.amountCents,
          }))
        )
          .filter((row) => row.cents > 0)
          .map((row) => ({ projectId: row.projectId, amountCents: row.cents }))
      : candidate.allocations;
    if (
      candidate.currency !== currency ||
      expectedShares.length !== provided.length ||
      expectedShares.some((expected) => {
        const rows = provided.filter(
          (row) => row.projectId === expected.projectId
        );
        const row = rows[0];
        return (
          rows.length !== 1 ||
          cents(row.amount) !== expected.amountCents ||
          (row.mouPaymentId ?? null) !== candidate.mouPaymentId ||
          (row.sharedMouGroupId ?? null) !== candidate.sharedMouGroupId ||
          (candidate.sponsorshipId &&
            (row.actualNetAmount == null ||
              row.actualNetAmount < 0 ||
              cents(row.actualNetAmount) > cents(row.amount)))
        );
      })
    )
      return {
        error:
          "The invoice balance or project split changed. Refresh and review the match.",
      };
    if (
      candidate.sponsorshipId &&
      sponsors.find((row) => row.id === candidate.sponsorshipId)?.status !==
        "invoiced"
    )
      return {
        error: "The sponsorship changed. Refresh and review its invoice.",
      };
  }
  // A standalone project invoice must not be claimed by another donation.
  const claimed = await tx
    .select({
      invoiceId: donationAllocations.invoiceId,
      id: donationAllocations.id,
    })
    .from(donationAllocations)
    .where(inArray(donationAllocations.invoiceId, ids));
  for (const row of claimed) {
    if (
      !oldInvoiceIds.has(row.invoiceId) &&
      !found.find((invoice) => invoice.id === row.invoiceId)?.sponsorshipId
    )
      return {
        error:
          "An invoice is already linked to a donation. Refresh and review the match.",
      };
  }
  return { invoices: locked, candidates, oldReceipts };
}

export async function restoreDonationInvoiceStatus(tx: Tx, ids: string[]) {
  for (const id of ids) {
    const deliveries = await tx
      .select({ id: invoiceDeliveries.id })
      .from(invoiceDeliveries)
      .where(eq(invoiceDeliveries.invoiceId, id))
      .limit(1);
    await tx
      .update(invoices)
      .set({ status: deliveries.length ? "sent" : "issued" })
      .where(
        and(
          eq(invoices.id, id),
          or(eq(invoices.status, "sent"), eq(invoices.status, "received"))
        )
      );
  }
}
