import { normalizeDonationText } from "./csv";

/** A sent proposal that an incoming donation may answer. */
export type DonationProposalCandidate = {
  proposalId: string;
  projectId: string;
  partner: string | null;
  /** True once the partner answered that they will give a donation. */
  answered: boolean;
};

/** Donor and partner names match when one contains the other after cleanup. */
export function donorMatchesParty(donor: string, party: string | null): boolean {
  const left = normalizeDonationText(donor);
  const right = normalizeDonationText(party ?? "");
  return Boolean(
    left && right && (left === right || left.includes(right) || right.includes(left))
  );
}

/**
 * The one proposal a project donation answers, or null when it is unclear.
 * A partner who already said "we will donate" wins over a proposal that is
 * still waiting. Two equally likely proposals are never guessed between.
 */
export function proposalForDonation(
  donor: string,
  projectId: string,
  candidates: DonationProposalCandidate[]
): string | null {
  const matches = candidates.filter(
    (candidate) =>
      candidate.projectId === projectId && donorMatchesParty(donor, candidate.partner)
  );
  const answered = matches.filter((candidate) => candidate.answered);
  if (answered.length === 1) return answered[0].proposalId;
  if (answered.length === 0 && matches.length === 1) return matches[0].proposalId;
  return null;
}
