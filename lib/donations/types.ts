export type DonationConfidence = "strong" | "possible" | "none";

export type DonationAllocationDraft = {
  key: string;
  projectId: string;
  projectTitle: string;
  amount: string;
  mouPaymentId: string | null;
  sharedMouGroupId: string | null;
  evidence: string[];
};

export type DonationSuggestion = {
  confidence: DonationConfidence;
  summary: string;
  evidence: string[];
  allocations: DonationAllocationDraft[];
  candidateProjectIds: string[];
};

export type DonationRowDTO = {
  id: string;
  importId: string;
  sourceRowNumber: number;
  donor: string;
  campaign: string | null;
  amount: string;
  currency: string;
  donationDate: string;
  notes: string | null;
  reviewStatus:
    | "needs_review"
    | "possible_duplicate"
    | "duplicate"
    | "unallocated"
    | "partially_allocated"
    | "allocated";
  duplicateOfId: string | null;
  duplicateResolutionNote: string | null;
  sourceFilename: string;
  allocations: DonationAllocationDraft[];
  allocatedAmount: string;
  unallocatedAmount: string;
  suggestion: DonationSuggestion;
};

export type DonationImportDTO = {
  id: string;
  sourceFilename: string;
  currency: string;
  rowCount: number;
  successfulRows: number;
  failedRows: number;
  newRows: number;
  exactDuplicateRows: number;
  possibleDuplicateRows: number;
  successfulAmount: string;
  createdAt: string;
  createdByName: string | null;
};

export type DonationProjectOption = {
  id: string;
  title: string;
  slug: string;
  partnerName: string | null;
};

export type DonationMouPaymentOption = {
  id: string;
  projectId: string;
  amount: string;
  currency: string;
  label: string;
};

export type DonationWorkspaceDTO = {
  donations: DonationRowDTO[];
  imports: DonationImportDTO[];
  projects: DonationProjectOption[];
  mouPayments: DonationMouPaymentOption[];
  summary: {
    needsReviewCount: number;
    needsReviewAmount: string;
    unallocatedCount: number;
    unallocatedAmount: string;
    postedCount: number;
    postedAmount: string;
    currency: string;
  };
};
