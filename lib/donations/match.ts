import { normalizeDonationText } from "./csv";
import type {
  DonationAllocationDraft,
  DonationSuggestion,
} from "./types";

export type MatchDonation = {
  id: string;
  donor: string;
  amountCents: number;
  notes: string | null;
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
  counterparty: string | null;
  invoiceNumber: string | null;
};

export type MatchSharedReceivable = {
  paymentId: string;
  groupId: string;
  groupName: string;
  counterparty: string | null;
  amountCents: number;
  members: {
    projectId: string;
    projectTitle: string;
    allocationCents: number;
  }[];
};

function partyMatches(donor: string, counterparty: string | null): boolean {
  const left = normalizeDonationText(donor);
  const right = normalizeDonationText(counterparty ?? "");
  return Boolean(left && right && (left === right || left.includes(right) || right.includes(left)));
}

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

/** Explainable matching only. Every result remains an admin-reviewed draft. */
export function buildDonationSuggestion(input: {
  donation: MatchDonation;
  projects: MatchProject[];
  receivables: MatchReceivable[];
  sharedReceivables: MatchSharedReceivable[];
}): DonationSuggestion {
  const { donation, projects, receivables, sharedReceivables } = input;
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
  const shared = sharedReceivables.find(
    (row) =>
      row.amountCents === donation.amountCents &&
      partyMatches(donation.donor, row.counterparty ?? row.groupName)
  );
  if (shared && shared.members.length > 0) {
    const allocated = allocateByWeights(donation.amountCents, shared.members);
    return {
      confidence: "strong",
      summary: `Matches shared MoU “${shared.groupName}”.`,
      evidence: ["Donor matches the MoU counterparty.", "Amount matches an unpaid shared MoU payment."],
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
    };
  }

  const donorReceivables = receivables.filter((row) =>
    partyMatches(donation.donor, row.counterparty)
  );
  const exact = donorReceivables.find(
    (row) => row.amountCents === donation.amountCents
  );
  if (exact) {
    const evidence = [
      "Donor matches the project funding partner.",
      exact.invoiceNumber
        ? `Amount matches unpaid invoice ${exact.invoiceNumber}.`
        : "Amount matches an unpaid MoU payment.",
    ];
    return {
      confidence: "strong",
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
  }

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
              : "Matches an unpaid MoU payment.",
          ],
          row.id
        )
      ),
      candidateProjectIds: [...new Set(subset.map((row) => row.projectId))],
    };
  }

  const noteProjects = projects.filter((project) =>
    titleMatchesNotes(project.title, donation.notes)
  );
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
