import { applyUniqueExactMouMatch } from "./exact-match";
import type {
  DonationAllocationDraft,
  DonationRowDTO,
  DonationWorkspaceDTO,
} from "./types";

/** Amount available to a new row, or to replace one row without changing others. */
export function remainingDonationAllocationAmount(
  amount: string,
  allocations: DonationAllocationDraft[],
  replacingKey?: string
): string {
  const totalCents = Math.round(Number(amount) * 100);
  let remainingCents = totalCents;
  for (const row of allocations) {
    if (row.key === replacingKey) continue;
    const cents = Math.round(Number(row.amount || 0) * 100);
    if (
      !Number.isFinite(cents) ||
      (cents !== 0 && Math.sign(cents) !== Math.sign(totalCents))
    ) {
      return "";
    }
    remainingCents -= cents;
  }
  return Number.isFinite(remainingCents) &&
    remainingCents !== 0 &&
    Math.sign(remainingCents) === Math.sign(totalCents)
    ? (remainingCents / 100).toFixed(2)
    : "";
}

/** Posted allocations and matched splits always take priority over manual defaults. */
export function initialDonationAllocationDrafts(
  donation: Pick<
    DonationRowDTO,
    "id" | "amount" | "currency" | "allocations" | "suggestion"
  >,
  projects: DonationWorkspaceDTO["projects"],
  mouPayments: DonationWorkspaceDTO["mouPayments"]
): DonationAllocationDraft[] {
  let rows: DonationAllocationDraft[];
  if (donation.allocations.length > 0) {
    return donation.allocations;
  } else if (donation.suggestion.allocations.length > 0) {
    rows = donation.suggestion.allocations;
  } else if (donation.suggestion.candidateProjectIds.length > 0) {
    rows = donation.suggestion.candidateProjectIds.slice(0, 8).map((projectId) => ({
      key: `candidate-${projectId}`,
      projectId,
      projectTitle:
        projects.find((project) => project.id === projectId)?.title ?? "Project",
      amount: "",
      mouPaymentId: null,
      sharedMouGroupId: null,
      evidence: ["Related project. Enter the amount after review."],
    }));
  } else {
    rows = [
      {
        key: `manual-${donation.id}`,
        projectId: "",
        projectTitle: "",
        amount: remainingDonationAllocationAmount(donation.amount, []),
        mouPaymentId: null,
        sharedMouGroupId: null,
        evidence: [],
      },
    ];
  }
  return rows.map((row) =>
    applyUniqueExactMouMatch(row, donation.currency, mouPayments)
  );
}
