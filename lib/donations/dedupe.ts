export type DonationDedupeState = {
  exactFingerprints: Set<string>;
  possibleByDonorAmountDate: Map<string, string>;
};

type DedupeRow = {
  rowFingerprint: string;
  donorKey: string;
  amountCents: number;
  donationDate: string;
};

const ANONYMOUS_DONOR =
  /^(?:anon|anonymous|anonymous (?:donor|giver|gift|contributor|supporter)|unknown|unknown donor|name withheld)$/;

/**
 * Donor identity for lookalike checks across export formats: "&" and "and"
 * are ignored, and every anonymous spelling is the same donor.
 */
export function lookalikeDonorKey(donorKey: string): string {
  const key = donorKey
    .split(" ")
    .filter((word) => word && word !== "and")
    .join(" ");
  return ANONYMOUS_DONOR.test(key) ? "anonymous" : key;
}

export function donationCandidateKey(row: DedupeRow): string {
  return `${lookalikeDonorKey(row.donorKey)}\u001f${row.amountCents}\u001f${row.donationDate}`;
}

/**
 * Track rows as they are imported so lookalikes inside the current CSV receive
 * the same warning as overlaps with an earlier monthly import.
 */
export function classifyDonationRow(
  state: DonationDedupeState,
  row: DedupeRow,
  rowId: string
):
  | { kind: "exact_duplicate" }
  | { kind: "new"; duplicateOfId: string | null } {
  if (state.exactFingerprints.has(row.rowFingerprint)) {
    return { kind: "exact_duplicate" };
  }
  state.exactFingerprints.add(row.rowFingerprint);
  const candidateKey = donationCandidateKey(row);
  const duplicateOfId =
    state.possibleByDonorAmountDate.get(candidateKey) ?? null;
  state.possibleByDonorAmountDate.set(candidateKey, rowId);
  return { kind: "new", duplicateOfId };
}
