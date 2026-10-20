import { normalizeDonationText } from "./csv";
import type { DonationAllocationDraft, DonationSuggestion } from "./types";
import {
  allocateSponsorshipCents,
  sponsorshipProjectShares,
} from "@/lib/sponsorships/compute";
import { allocateSharedReceipt } from "@/lib/agreements/readiness";

export type DonationInvoiceSource = {
  id: string;
  invoiceNumber: string;
  currency: string;
  recipientName: string | null;
  status: string;
  amount: string;
  projectId: string;
  mouPaymentId: string | null;
  sharedMouGroupId: string | null;
  sponsorshipId: string | null;
  lineItems: Array<{
    projectId: string;
    quantity: number;
    unitPrice: string;
  }> | null;
  paidAt: Date | null;
  deductionBps: number | null;
};

/** Use immutable invoice lines and subtract only active sponsorship receipts. */
export function donationInvoiceCandidates(
  sources: DonationInvoiceSource[],
  titles: Map<string, string>,
  sharedMembers: Map<
    string,
    Array<{ projectId: string; allocationCents: number }>
  >,
  sponsorshipReceived: Array<{
    invoiceId: string;
    projectId: string;
    amount: string;
  }>
): DonationInvoiceCandidate[] {
  return sources.flatMap((invoice) => {
    if (invoice.status !== "sent" || invoice.paidAt) return [];
    const full = Math.round(Number(invoice.amount) * 100);
    let shares = [{ projectId: invoice.projectId, cents: full }];
    if (invoice.sponsorshipId) {
      const invoiceShares = sponsorshipProjectShares(invoice.lineItems ?? []);
      if (invoiceShares.reduce((sum, row) => sum + row.cents, 0) !== full) return [];
      shares = invoiceShares.map(
        (share) => ({
          ...share,
          cents:
            share.cents -
            sponsorshipReceived
              .filter(
                (row) =>
                  row.invoiceId === invoice.id &&
                  row.projectId === share.projectId
              )
              .reduce(
                (sum, row) => sum + Math.round(Number(row.amount) * 100),
                0
              ),
        })
      );
    } else if (invoice.sharedMouGroupId) {
      const members = sharedMembers.get(invoice.sharedMouGroupId) ?? [];
      if (!members.length || members.some((row) => row.allocationCents <= 0))
        return [];
      shares = allocateSharedReceipt(
        invoice.amount,
        members.map((row) => ({
          projectId: row.projectId,
          membershipId: row.projectId,
          amount: (row.allocationCents / 100).toFixed(2),
        }))
      ).map((row) => ({
        projectId: row.projectId,
        cents: Math.round(Number(row.amount) * 100),
      }));
    }
    if (shares.some((row) => row.cents < 0 || !titles.has(row.projectId)))
      return [];
    shares = shares.filter((row) => row.cents > 0);
    const outstanding = shares.reduce((sum, row) => sum + row.cents, 0);
    if (!outstanding) return [];
    const net = invoice.sponsorshipId
      ? allocateSponsorshipCents(
          Math.round(
            (outstanding * (10000 - (invoice.deductionBps ?? 0))) / 10000
          ),
          shares
        )
      : shares;
    return [
      {
        ...invoice,
        amountCents: outstanding,
        allocations: shares.map((row) => ({
          projectId: row.projectId,
          projectTitle: titles.get(row.projectId)!,
          amountCents: row.cents,
          actualNetCents:
            net.find((item) => item.projectId === row.projectId)?.cents ?? 0,
        })),
      },
    ];
  });
}

export type DonationInvoiceCandidate = {
  id: string;
  invoiceNumber: string;
  currency: string;
  recipientName: string | null;
  status: string;
  amountCents: number;
  mouPaymentId: string | null;
  sharedMouGroupId: string | null;
  sponsorshipId: string | null;
  allocations: Array<{
    projectId: string;
    projectTitle: string;
    amountCents: number;
    actualNetCents?: number;
  }>;
};

function referencesInvoice(notes: string | null, number: string) {
  // Boundaries matter: invoice 12 must not match a reference to invoice 120.
  const escaped = number.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Boolean(
    number &&
      new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "i").test(notes ?? "")
  );
}

/** Sent invoices are units: a multi-book invoice keeps its reviewed project split. */
export function matchDonationInvoices(
  donation: {
    donor: string;
    notes: string | null;
    amountCents: number;
    currency: string;
  },
  invoices: DonationInvoiceCandidate[]
): DonationSuggestion | null {
  if (donation.amountCents <= 0) return null;
  const donor = normalizeDonationText(donation.donor);
  const candidates = invoices.filter((invoice) => {
    const recipient = normalizeDonationText(invoice.recipientName ?? "");
    return (
      invoice.status === "sent" &&
      invoice.currency === donation.currency &&
      invoice.amountCents > 0 &&
      invoice.allocations.length > 0 &&
      invoice.allocations.every((row) => row.amountCents > 0) &&
      invoice.allocations.reduce((sum, row) => sum + row.amountCents, 0) ===
        invoice.amountCents &&
      (referencesInvoice(donation.notes, invoice.invoiceNumber) ||
        Boolean(
          donor &&
            recipient &&
            (donor === recipient ||
              donor.includes(recipient) ||
              recipient.includes(donor))
        ))
    );
  });
  const referenced = candidates.filter((row) =>
    referencesInvoice(donation.notes, row.invoiceNumber)
  );
  const referencedTotal = referenced.reduce((sum, row) => sum + row.amountCents, 0);
  const pool = referenced.length && referencedTotal === donation.amountCents
    ? referenced
    : candidates.filter(row => row.amountCents <= donation.amountCents);
  // Bound work and keep ambiguity visible instead of choosing the first equal sum.
  if (pool.length > 20) return null;
  const matches: DonationInvoiceCandidate[][] = [];
  function visit(
    index: number,
    total: number,
    chosen: DonationInvoiceCandidate[]
  ) {
    if (matches.length > 1) return;
    if (total === donation.amountCents) {
      if (
        referenced.every((invoice) =>
          chosen.some((row) => row.id === invoice.id)
        )
      )
        matches.push(chosen);
      return;
    }
    if (index === pool.length || total > donation.amountCents) return;
    visit(index + 1, total + pool[index].amountCents, [...chosen, pool[index]]);
    visit(index + 1, total, chosen);
  }
  visit(0, 0, []);
  const partialPool = referenced.length ? referenced : candidates;
  let partial = false;
  if (
    matches.length === 0 &&
    partialPool.length === 1 &&
    partialPool[0].sponsorshipId &&
    partialPool[0].amountCents > donation.amountCents
  ) {
    const invoice = partialPool[0];
    partial = true;
    const shares = allocateSponsorshipCents(
      donation.amountCents,
      invoice.allocations.map((row) => ({
        projectId: row.projectId,
        cents: row.amountCents,
      }))
    );
    const netRatio =
      invoice.allocations.reduce(
        (sum, row) => sum + (row.actualNetCents ?? row.amountCents),
        0
      ) / invoice.amountCents;
    const net = allocateSponsorshipCents(
      Math.round(donation.amountCents * netRatio),
      shares
    );
    matches.push([
      {
        ...invoice,
        amountCents: donation.amountCents,
        allocations: shares
          .filter((row) => row.cents > 0)
          .map((row) => ({
            projectId: row.projectId,
            projectTitle: invoice.allocations.find(
              (item) => item.projectId === row.projectId
            )!.projectTitle,
            amountCents: row.cents,
            actualNetCents: net.find(
              (item) => item.projectId === row.projectId
            )!.cents,
          })),
      },
    ]);
  }
  if (matches.length === 0) return null;
  if (matches.length > 1)
    return {
      confidence: "possible",
      summary:
        "Several sent invoices could match. Review the invoice numbers and project split.",
      evidence: ["More than one invoice combination has the same total."],
      allocations: [],
      candidateProjectIds: [
        ...new Set(
          pool.flatMap((row) =>
            row.allocations.map((allocation) => allocation.projectId)
          )
        ),
      ],
    };
  const selected = matches[0];
  const allocations: DonationAllocationDraft[] = selected.flatMap((invoice) =>
    invoice.allocations.map((row) => ({
      key: `invoice-${invoice.id}-${row.projectId}`,
      projectId: row.projectId,
      projectTitle: row.projectTitle,
      amount: (row.amountCents / 100).toFixed(2),
      actualNetAmount: invoice.sponsorshipId
        ? ((row.actualNetCents ?? row.amountCents) / 100).toFixed(2)
        : null,
      mouPaymentId: invoice.mouPaymentId,
      sharedMouGroupId: invoice.sharedMouGroupId,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      sponsorshipId: invoice.sponsorshipId,
      evidence: [
        `Sent ${invoice.sponsorshipId ? "sponsorship " : ""}invoice ${invoice.invoiceNumber}.`,
      ],
    }))
  );
  return {
    confidence: "strong",
    summary:
      selected.length === 1
        ? `Matches sent invoice ${selected[0].invoiceNumber}.`
        : `Matches ${selected.length} sent invoices.`,
    evidence: [
      referenced.length
        ? "The donation note names the invoice."
        : "Donor matches the invoice recipient.",
      partial
        ? "This is a partial sponsorship payment. The invoice keeps its unpaid balance."
        : "The unpaid invoice balances add up to this donation.",
      "Project shares come from the invoices.",
    ],
    allocations,
    candidateProjectIds: [...new Set(allocations.map((row) => row.projectId))],
  };
}
