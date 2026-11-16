import { normalizeDonationText } from "./csv";
import { donorMatchesParty as partyMatches } from "./proposal-match";
import { matchDonationInvoices, type DonationInvoiceCandidate } from "./invoice-match";
import type {
  DonationAllocationDraft,
  DonationSuggestion,
} from "./types";

export type MatchDonation = {
  id: string;
  donor: string;
  amountCents: number;
  notes: string | null;
  currency?: string;
};

export type MatchProject = {
  id: string;
  title: string;
  partnerName: string | null;
  budgetCents: number;
  receivedCents: number;
  priorAllocationCount: number;
};

export type MatchReceivable = {
  id: string;
  projectId: string;
  projectTitle: string;
  amountCents: number;
  currency: string;
  counterparty: string | null;
  invoiceNumber: string | null;
};

export type MatchSharedReceivable = {
  paymentId: string;
  groupId: string;
  groupName: string;
  counterparty: string | null;
  amountCents: number;
  currency: string;
  members: {
    projectId: string;
    projectTitle: string;
    allocationCents: number;
  }[];
};

/** A sent proposal whose partner may give through the giving platform. */
export type MatchDonationPromise = {
  proposalId: string;
  projectId: string;
  projectTitle: string;
  partner: string | null;
  /** True once the partner answered that they will give a donation. */
  answered: boolean;
  /** Promised amount still to come; null when the amount is not fixed. */
  outstandingCents: number | null;
};

function amount(value: number): string {
  return (value / 100).toFixed(2);
}

function allocateByWeights(
  totalCents: number,
  members: MatchSharedReceivable["members"]
): number[] {
  const totalWeight = members.reduce(
    (sum, member) => sum + member.allocationCents,
    0
  );
  if (totalWeight <= 0) return members.map(() => 0);
  const portions = members.map((member, index) => {
    const exact = (totalCents * member.allocationCents) / totalWeight;
    return {
      index,
      cents: Math.floor(exact),
      remainder: exact - Math.floor(exact),
      projectId: member.projectId,
    };
  });
  let remaining =
    totalCents - portions.reduce((sum, portion) => sum + portion.cents, 0);
  const order = [...portions].sort(
    (a, b) =>
      b.remainder - a.remainder || a.projectId.localeCompare(b.projectId)
  );
  for (let index = 0; remaining > 0; index += 1, remaining -= 1) {
    order[index % order.length].cents += 1;
  }
  return portions.sort((a, b) => a.index - b.index).map((item) => item.cents);
}

function exactSubset(
  rows: MatchReceivable[],
  target: number
): MatchReceivable[] | null {
  const candidates = rows
    .filter((row) => row.amountCents > 0 && row.amountCents <= target)
    .slice(0, 14);
  let best: MatchReceivable[] | null = null;
  function visit(index: number, total: number, chosen: MatchReceivable[]) {
    if (total === target) {
      if (!best || chosen.length < best.length) best = [...chosen];
      return;
    }
    if (index >= candidates.length || total > target || (best && chosen.length >= best.length)) {
      return;
    }
    visit(index + 1, total + candidates[index].amountCents, [
      ...chosen,
      candidates[index],
    ]);
    visit(index + 1, total, chosen);
  }
  visit(0, 0, []);
  return best;
}

function titleMatchesNotes(title: string, notes: string | null): boolean {
  const normalizedTitle = normalizeDonationText(title);
  const normalizedNotes = normalizeDonationText(notes ?? "");
  if (!normalizedTitle || !normalizedNotes) return false;
  if (normalizedNotes.includes(normalizedTitle)) return true;
  const useful = normalizedTitle
    .split(" ")
    .filter((token) => token.length >= 4);
  if (useful.length < 2) return false;
  const hits = useful.filter((token) => normalizedNotes.includes(token)).length;
  return hits >= 2 && hits / useful.length >= 0.5;
}

function draft(
  key: string,
  projectId: string,
  projectTitle: string,
  amountCents: number,
  evidence: string[],
  mouPaymentId: string | null = null,
  sharedMouGroupId: string | null = null
): DonationAllocationDraft {
  return {
    key,
    projectId,
    projectTitle,
    amount: amount(amountCents),
    mouPaymentId,
    sharedMouGroupId,
    evidence,
  };
}

function chooseExactPayment(
  matches: DonationSuggestion[]
): DonationSuggestion {
  if (matches.length === 1) {
    const match = matches[0];
    return match.confidence === "strong" ? match : {
      ...match,
      evidence: ["Only one unpaid expected payment matches this amount and currency.", ...match.evidence],
    };
  }
  return {
    confidence: "possible",
    summary: "Several expected payments match this amount. Review the project links.",
    evidence: ["More than one unpaid expected payment has the same amount and currency."],
    allocations: [],
    candidateProjectIds: [...new Set(matches.flatMap((match) => match.candidateProjectIds))],
  };
}

/** Explainable matching only. Every result remains an admin-reviewed draft. */
export function buildDonationSuggestion(input: {
  donation: MatchDonation;
  projects: MatchProject[];
  receivables: MatchReceivable[];
  sharedReceivables: MatchSharedReceivable[];
  invoices?: DonationInvoiceCandidate[];
  promises?: MatchDonationPromise[];
}): DonationSuggestion {
  const { donation, projects } = input;
  const receivables = input.receivables.filter(
    (row) => !donation.currency || row.currency === donation.currency
  );
  const sharedReceivables = input.sharedReceivables.filter(
    (row) => !donation.currency || row.currency === donation.currency
  );
  if (donation.amountCents < 0) {
    const related = projects.filter(
      (project) =>
        partyMatches(donation.donor, project.partnerName) ||
        project.priorAllocationCount > 0
    );
    return {
      confidence: related.length > 0 ? "possible" : "none",
      summary:
        related.length > 0
          ? "This adjustment may belong to a previously related project."
          : "Negative adjustment needs a project decision.",
      evidence: [
        "Negative amounts are imported as refunds or reversals and are never auto-posted.",
      ],
      allocations: [],
      candidateProjectIds: related.map((project) => project.id),
    };
  }
  const invoiceMatch = donation.currency ? matchDonationInvoices({ ...donation, currency: donation.currency }, input.invoices ?? []) : null;
  if (invoiceMatch) return invoiceMatch;
  const noteProjects = projects.filter((project) =>
    titleMatchesNotes(project.title, donation.notes)
  );
  // An exact amount is useful even when no funding partner was saved. Keep
  // identity-backed matches stronger, and never select a tied payment by order.
  const exactPayments = receivables.filter(
    (row) => row.amountCents > 0 && row.amountCents === donation.amountCents
  ).map((exact) => {
    const donorMatches = partyMatches(donation.donor, exact.counterparty);
    const noteMatches = titleMatchesNotes(exact.projectTitle, donation.notes);
    const evidence = [
      ...(donorMatches ? ["Donor matches the expected payment’s funding partner."] : []),
      ...(noteMatches ? ["Donation note matches the project title."] : []),
      exact.invoiceNumber
        ? `Amount matches unpaid invoice ${exact.invoiceNumber}.`
        : "Amount matches an unpaid expected payment.",
      ...(!donorMatches && !noteMatches
        ? ["Donor name is not matched. Check the project before confirming."]
        : []),
    ];
    const suggestion: DonationSuggestion = {
      confidence: donorMatches || noteMatches ? "strong" : "possible",
      summary: `Matches ${exact.projectTitle}.`,
      evidence,
      allocations: [
        draft(
          `payment-${exact.id}`,
          exact.projectId,
          exact.projectTitle,
          exact.amountCents,
          evidence,
          exact.id
        ),
      ],
      candidateProjectIds: [exact.projectId],
    };
    return { strength: Number(donorMatches) + Number(noteMatches), suggestion };
  });
  for (const shared of sharedReceivables) {
    if (
      shared.amountCents <= 0 ||
      shared.amountCents !== donation.amountCents ||
      !shared.members.length ||
      shared.members.some((member) => member.allocationCents <= 0)
    ) continue;
    const donorMatches = partyMatches(donation.donor, shared.counterparty ?? shared.groupName);
    const noteMatches = titleMatchesNotes(shared.groupName, donation.notes) ||
      shared.members.some((member) => titleMatchesNotes(member.projectTitle, donation.notes));
    const allocated = allocateByWeights(donation.amountCents, shared.members);
    exactPayments.push({
      strength: Number(donorMatches) + Number(noteMatches),
      suggestion: {
        confidence: donorMatches || noteMatches ? "strong" : "possible",
        summary: `Matches shared MoU “${shared.groupName}”.`,
        evidence: [
          ...(donorMatches ? ["Donor matches the MoU counterparty."] : []),
          ...(noteMatches ? ["Donation note names the shared MoU or one of its projects."] : []),
          "Amount matches an unpaid shared MoU payment.",
          ...(!donorMatches && !noteMatches
            ? ["Donor name is not matched. Check the project before confirming."]
            : []),
        ],
        allocations: shared.members.map((member, index) =>
          draft(
            `shared-${shared.paymentId}-${member.projectId}`,
            member.projectId,
            member.projectTitle,
            allocated[index],
            ["Reviewed shared MoU allocation."],
            shared.paymentId,
            shared.groupId
          )
        ),
        candidateProjectIds: shared.members.map((member) => member.projectId),
      },
    });
  }
  const strongest = Math.max(0, ...exactPayments.map((match) => match.strength));
  if (strongest > 0) {
    return chooseExactPayment(exactPayments
      .filter((match) => match.strength === strongest)
      .map((match) => match.suggestion));
  }

  const donorReceivables = receivables.filter((row) =>
    partyMatches(donation.donor, row.counterparty)
  );
  const subset = exactSubset(donorReceivables, donation.amountCents);
  if (subset && subset.length > 1) {
    return {
      confidence: "strong",
      summary: `Matches ${subset.length} unpaid project payments.`,
      evidence: [
        "Donor matches each project funding partner.",
        "The unpaid payment amounts add up to this donation.",
      ],
      allocations: subset.map((row) =>
        draft(
          `payment-${row.id}`,
          row.projectId,
          row.projectTitle,
          row.amountCents,
          [
            row.invoiceNumber
              ? `Matches invoice ${row.invoiceNumber}.`
              : "Matches an unpaid expected payment.",
          ],
          row.id
        )
      ),
      candidateProjectIds: [...new Set(subset.map((row) => row.projectId))],
    };
  }

  const amountOnlyMatch = exactPayments.length > 0 && noteProjects.length === 0
    ? chooseExactPayment(exactPayments.map((match) => match.suggestion))
    : null;

  // Proposals to this donor: one per project, promised donations first.
  const donorPromises = [
    ...new Map(
      (input.promises ?? [])
        .filter((promise) => partyMatches(donation.donor, promise.partner))
        .sort((a, b) => Number(a.answered) - Number(b.answered))
        .map((promise) => [promise.projectId, promise])
    ).values(),
  ];
  if (donorPromises.length === 1) {
    const promise = donorPromises[0];
    const amountMatches = promise.outstandingCents === donation.amountCents;
    if (amountOnlyMatch && !(promise.answered && amountMatches)) return amountOnlyMatch;
    const evidence = [
      "Donor matches the partner on a proposal for this project.",
      promise.answered
        ? "The partner answered that they will give a donation."
        : "The proposal is still waiting for an answer.",
      ...(amountMatches ? ["Amount matches the promised donation."] : []),
    ];
    return {
      confidence: promise.answered && amountMatches ? "strong" : "possible",
      summary: promise.answered
        ? `Promised donation for ${promise.projectTitle}.`
        : `Possible answer to the proposal for ${promise.projectTitle}.`,
      evidence,
      allocations: [
        draft(
          `promise-${promise.proposalId}`,
          promise.projectId,
          promise.projectTitle,
          donation.amountCents,
          evidence
        ),
      ],
      candidateProjectIds: [promise.projectId],
    };
  }
  if (donorPromises.length > 1) {
    const fixed = donorPromises.every(
      (promise) => promise.answered && promise.outstandingCents != null
    );
    const promisedTotal = donorPromises.reduce(
      (sum, promise) => sum + (promise.outstandingCents ?? 0),
      0
    );
    if (fixed && promisedTotal === donation.amountCents) {
      return {
        confidence: "strong",
        summary: `Matches promised donations for ${donorPromises.length} projects.`,
        evidence: [
          "Donor matches the partner on each project’s proposal.",
          "The promised donations add up to this donation.",
        ],
        allocations: donorPromises.map((promise) =>
          draft(
            `promise-${promise.proposalId}`,
            promise.projectId,
            promise.projectTitle,
            promise.outstandingCents ?? 0,
            ["The partner answered that they will give a donation."]
          )
        ),
        candidateProjectIds: donorPromises.map((promise) => promise.projectId),
      };
    }
    if (amountOnlyMatch) return amountOnlyMatch;
    return {
      confidence: "possible",
      summary: `${donorPromises.length} projects have a proposal to this donor.`,
      evidence: [
        "Donor matches the partner on each project’s proposal.",
        "Sastra cannot infer the split. Enter each project’s amount.",
      ],
      allocations: [],
      candidateProjectIds: donorPromises.map((promise) => promise.projectId),
    };
  }

  if (amountOnlyMatch) return amountOnlyMatch;

  if (noteProjects.length === 1) {
    const project = noteProjects[0];
    return {
      confidence: "possible",
      summary: `The note names ${project.title}.`,
      evidence: ["Donation note matches the project title."],
      allocations: [
        draft(
          `note-${project.id}`,
          project.id,
          project.title,
          donation.amountCents,
          ["Donation note matches the project title."]
        ),
      ],
      candidateProjectIds: [project.id],
    };
  }

  const partnerProjects = projects.filter((project) =>
    partyMatches(donation.donor, project.partnerName)
  );
  const priorProjects = projects.filter(
    (project) => project.priorAllocationCount > 0
  );
  const candidates = noteProjects.length > 0
    ? noteProjects
    : partnerProjects.length > 0
      ? partnerProjects
      : priorProjects;
  if (candidates.length === 1) {
    const project = candidates[0];
    const evidence =
      project.priorAllocationCount > 0
        ? ["The same donor was allocated to this project before."]
        : ["Donor matches the project funding partner."];
    return {
      confidence: "possible",
      summary: `Possible match to ${project.title}.`,
      evidence,
      allocations: [
        draft(
          `candidate-${project.id}`,
          project.id,
          project.title,
          donation.amountCents,
          evidence
        ),
      ],
      candidateProjectIds: [project.id],
    };
  }

  return {
    confidence: candidates.length > 0 ? "possible" : "none",
    summary:
      candidates.length > 0
        ? `${candidates.length} related projects need an allocation decision.`
        : "No reliable project match.",
    evidence:
      candidates.length > 0
        ? ["Related projects were found, but Sastra cannot infer the split."]
        : [],
    allocations: [],
    candidateProjectIds: candidates.map((project) => project.id),
  };
}
