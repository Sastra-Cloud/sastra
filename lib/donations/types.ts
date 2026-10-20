import type { DonationCsvMapping } from "@/lib/db/schema/donations";

export type DonationConfidence = "strong" | "possible" | "none";

export type DonationAllocationDraft = {
  key: string;
  projectId: string;
  projectTitle: string;
  amount: string;
  mouPaymentId: string | null;
  sharedMouGroupId: string | null;
  evidence: string[];
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  invoiceStatus?: string | null;
  sponsorshipId?: string | null;
  actualNetAmount?: string | null;
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
  /** The earlier donation a possible duplicate matches, when it is loaded. */
  duplicateOf: {
    donor: string;
    donationDate: string;
    amount: string;
    currency: string;
    sourceFilename: string;
    sourceRowNumber: number;
    reviewStatus: DonationRowDTO["reviewStatus"];
  } | null;
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
  formatName: string | null;
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

export type DonationCsvFormatDTO = {
  id: string;
  name: string;
  mapping: DonationCsvMapping;
  createdAt: string;
  lastUsedAt: string | null;
  createdByName: string | null;
};

export type DonationWorkspaceDTO = {
  donations: DonationRowDTO[];
  imports: DonationImportDTO[];
  formats: DonationCsvFormatDTO[];
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

/** Dry run of one column mapping, shown before a new CSV format is saved. */
export type DonationCsvPreview = {
  rowCount: number;
  receivedRows: number;
  failedRows: number;
  receivedAmount: string;
  sample: Array<{
    rowNumber: number;
    date: string;
    donor: string;
    amount: string;
    campaign: string | null;
    status: string;
  }>;
  error: string | null;
  statusValues: Array<{ value: string; count: number }>;
  numericDates: boolean;
};

/** An uploaded CSV whose header layout Sastra has not seen before. */
export type DonationCsvFormatProposal = {
  fileId: string;
  sourceFilename: string;
  headers: string[];
  name: string;
  mapping: DonationCsvMapping;
  preview: DonationCsvPreview;
  /** The header rules could not fill every required field or read every row. */
  needsAi: boolean;
  aiAvailable: boolean;
  currency: string;
};

export type DonationImportResult = {
  importId?: string;
  newRows?: number;
  exactDuplicateRows?: number;
  possibleDuplicateRows?: number;
  failedRows?: number;
  alreadyImported?: boolean;
  needsFormat?: DonationCsvFormatProposal;
  error?: string;
};
