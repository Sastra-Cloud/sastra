/**
 * Shapes for AI document import (MOU / license / grant → projects).
 *
 * `ImportExtraction` is what the model returns and what the manager edits in the
 * review UI. It is intentionally close to the extraction JSON schema in
 * `lib/imports/schema.ts`; the Zod normalizer there coerces raw model output
 * into this exact shape before it is stored.
 */

import type { BudgetCategory, BudgetUnit } from "@/lib/budget/compute";
import type { VideoProductionMode } from "@/lib/projects/kinds";

export type ExtractedBudgetLine = {
  label: string;
  category: BudgetCategory;
  unit: BudgetUnit;
  quantity: number | null;
  unitPrice: number | null;
  /** The document's stated line total. Authoritative when present. */
  amount: number | null;
  /** Allocation and FX provenance retained with the committed budget line. */
  notes: string | null;
};

export type ExtractedMouPayment = {
  deliveryRequirements?: string[];
  sourceClause?: string | null;
  trigger: "on_signing" | "on_completion" | "on_52_episodes" | "custom";
  amount: number | null;
  dueDate: string | null;
  notes: string | null;
};

export type ExtractedObligationKind =
  | "attribution"
  | "copyright_notice"
  | "artwork_approval"
  | "analytics_report"
  | "format_restriction"
  | "territory_restriction"
  | "sample_delivery"
  | "other";

export type ExtractedObligationCadence =
  | "per_episode"
  | "per_artwork"
  | "monthly"
  | "quarterly"
  | "annual"
  | "standing"
  | "on_publish";

/** A standing license obligation lifted verbatim from the agreement. */
export type ExtractedObligation = {
  /** Source clause reference, e.g. "2.2" or "5". */
  clauseRef: string | null;
  kind: ExtractedObligationKind;
  cadence: ExtractedObligationCadence;
  /** First report deadline only when the agreement states one explicitly. */
  firstDueDate: string | null;
  /** Short human summary. */
  label: string;
  /** The exact contractual language, verbatim. */
  text: string;
};

export type ExtractedProjectKind =
  | "book"
  | "article"
  | "podcast"
  | "video_series"
  | "other";

export type ExtractedFormats = {
  print: boolean;
  ebook: boolean;
  audio: boolean;
  video: boolean;
};

export type ExtractedProject = {
  title: string;
  description: string | null;
  /**
   * Project medium, so the importer can create podcast projects (episodic/audio)
   * distinctly from books and article collections. Null when the model can't tell.
   */
  kind: ExtractedProjectKind | null;
  /** Project-wide editorial workflow for video series; defaults to original. */
  videoProductionMode: VideoProductionMode | null;
  sourceAuthor: string | null;
  /**
   * The original copyright holder a commercial publishing license must be
   * secured from (e.g. "Union"), when the work is not public domain. Distinct
   * from the funder/MOU partner. Null/empty when none is named or not needed.
   */
  licenseHolder: string | null;
  /** True when this document itself grants usable publishing rights now. */
  rightsGrantedByAgreement: boolean;
  formats: ExtractedFormats;
  territory: string | null;
  maxCopies: number | null;
  startDate: string | null; // ISO yyyy-mm-dd
  publicationDate: string | null; // ISO yyyy-mm-dd (project due date)
  /** "Complete within N months of signing" → used to compute the due date. */
  completeWithinMonths: number | null;
  /** Date by which a progress update is owed to the MOU partner (yyyy-mm-dd). */
  partnerUpdateDate: string | null;
  wordCount: number | null;
  /** Initial license term length in months (e.g. 5 years → 60). */
  licenseTermMonths: number | null;
  /** True if the agreement auto-renews at the end of the term. */
  autoRenews: boolean;
  /** Length of each auto-renewal period in months (e.g. 12). */
  renewalMonths: number | null;
  /** Days' written notice required to terminate / not renew. */
  renewalNoticeDays: number | null;
  /** Party that owns the copyright of the work/translation. */
  copyrightHolder: string | null;
  /** Verbatim © notice block to print when laying out the book. */
  copyrightNotice: string | null;
  currency: string | null; // e.g. "USD"
  /** Automatic reference-rate conversion applied before manager review. */
  fxConversion: {
    from: string;
    to: "USD";
    rate: number;
    rateDate: string;
    provider: string;
  } | null;
  totalAmount: number | null;
  paymentTerms: string | null;
  /**
   * For a podcast/episodic series: the number of episodes the agreement covers
   * (e.g. "104 episodes" → 104). Materialized into episode units on commit.
   */
  episodeCount: number | null;
  /** Whether episodeCount is a series total or an increment for an existing show. */
  episodeCountMode: "total" | "additional";
  /**
   * True when the grant is restricted to FREE / non-commercial distribution (the
   * work may not be sold). Keeps `commercialGranted` false even for a signed
   * license, while formats stay granted.
   */
  nonCommercialOnly: boolean;
  budgetLines: ExtractedBudgetLine[];
  /** Standing license obligations (audio cue, artwork approval, © notice, reports). */
  obligations: ExtractedObligation[];
};

export type ImportAgreementType = "mou_only" | "mou_plus_license" | "license_only";

export type ExtractedInvoice = {
  /** Whether the workspace issued or received the invoice. Must be reviewed. */
  direction: "outgoing" | "incoming" | "unknown";
  invoiceNumber: string | null;
  issueDate: string | null;
  dueDate: string | null;
  issuerName: string | null;
  recipientName: string | null;
  recipientEmail: string | null;
  projectTitle: string | null;
  amount: number | null;
  currency: string | null;
  description: string | null;
};

export type ImportExtraction = {
  documentKind: "agreement" | "invoice";
  /** Present only when documentKind is invoice. */
  invoice: ExtractedInvoice | null;
  agreementType: ImportAgreementType;
  partnerOrg: string | null; // funder / rights holder, e.g. "Desiring God"
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  signedDate: string | null; // ISO; presence drives mouStatus = "signed"
  documentTitle: string | null;
  /** Total funding promised by the agreement across all covered projects. */
  agreementTotalAmount: number | null;
  /** Agreement-level receivables, stored once rather than repeated per project. */
  mouPaymentSchedule: ExtractedMouPayment[];
  /** Project card that owns the shared receivable records; null requires review. */
  paymentProjectIndex: number | null;
  projects: ExtractedProject[];
};
