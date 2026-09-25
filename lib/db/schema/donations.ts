import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { files } from "./files";
import { fundingReceipts, mouPayments } from "./budget";
import { projects } from "./projects";
import { sharedMouGroups } from "./agreements";

export type DonationReviewStatus =
  | "needs_review"
  | "possible_duplicate"
  | "duplicate"
  | "unallocated"
  | "partially_allocated"
  | "allocated";

export type DonationAllocationSnapshot = {
  projectId: string;
  projectTitle: string;
  amount: string;
  mouPaymentId: string | null;
  sharedMouGroupId: string | null;
};

/** One reviewed monthly CSV upload. Ledger metadata survives source-byte purge. */
export const donationImports = pgTable(
  "donation_imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fileId: uuid("file_id")
      .references(() => files.id, { onDelete: "set null" }),
    sourceFilename: text("source_filename").notNull(),
    fileHash: text("file_hash").notNull(),
    currency: text("currency").notNull().default("USD"),
    rowCount: integer("row_count").notNull().default(0),
    successfulRows: integer("successful_rows").notNull().default(0),
    failedRows: integer("failed_rows").notNull().default(0),
    newRows: integer("new_rows").notNull().default(0),
    exactDuplicateRows: integer("exact_duplicate_rows").notNull().default(0),
    possibleDuplicateRows: integer("possible_duplicate_rows")
      .notNull()
      .default(0),
    successfulAmount: numeric("successful_amount", {
      precision: 16,
      scale: 2,
    })
      .notNull()
      .default("0"),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    sourceRetentionUntil: timestamp("source_retention_until"),
    sourcePurgedAt: timestamp("source_purged_at"),
    sourcePurgeReason: text("source_purge_reason"),
    sourceLegalHold: boolean("source_legal_hold").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("donation_imports_file_uq").on(t.fileId),
    uniqueIndex("donation_imports_hash_uq").on(t.fileHash),
    index("donation_imports_created_idx").on(t.createdAt),
  ]
);

/** One successful donation row from an imported giving-platform export. */
export const donations = pgTable(
  "donations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importId: uuid("import_id")
      .notNull()
      .references(() => donationImports.id, { onDelete: "restrict" }),
    sourceRowNumber: integer("source_row_number").notNull(),
    rowFingerprint: text("row_fingerprint").notNull(),
    campaignExternalId: text("campaign_external_id"),
    donor: text("donor").notNull(),
    donorKey: text("donor_key").notNull(),
    campaign: text("campaign"),
    recurring: text("recurring"),
    amount: numeric("amount", { precision: 16, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("USD"),
    paymentMethod: text("payment_method"),
    sourceStatus: text("source_status").notNull(),
    donationDate: date("donation_date").notNull(),
    sourceDateTime: text("source_date_time").notNull(),
    notes: text("notes"),
    reviewStatus: text("review_status")
      .$type<DonationReviewStatus>()
      .notNull()
      .default("needs_review"),
    duplicateOfId: uuid("duplicate_of_id"),
    duplicateResolutionNote: text("duplicate_resolution_note"),
    reviewedBy: text("reviewed_by").references(() => user.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("donations_row_fingerprint_uq").on(t.rowFingerprint),
    uniqueIndex("donations_import_row_uq").on(t.importId, t.sourceRowNumber),
    index("donations_review_status_idx").on(t.reviewStatus, t.donationDate),
    index("donations_duplicate_candidate_idx").on(
      t.donorKey,
      t.amount,
      t.donationDate
    ),
    index("donations_import_idx").on(t.importId),
  ]
);

/** Current reviewed split from one donation into project funding ledgers. */
export const donationAllocations = pgTable(
  "donation_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    donationId: uuid("donation_id")
      .notNull()
      .references(() => donations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    fundingReceiptId: uuid("funding_receipt_id")
      .notNull()
      .references(() => fundingReceipts.id, { onDelete: "restrict" }),
    mouPaymentId: uuid("mou_payment_id").references(() => mouPayments.id, {
      onDelete: "restrict",
    }),
    sharedMouGroupId: uuid("shared_mou_group_id").references(
      () => sharedMouGroups.id,
      { onDelete: "restrict" }
    ),
    amount: numeric("amount", { precision: 16, scale: 2 }).notNull(),
    note: text("note"),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("donation_allocations_receipt_uq").on(t.fundingReceiptId),
    index("donation_allocations_donation_idx").on(t.donationId),
    index("donation_allocations_project_idx").on(t.projectId),
    index("donation_allocations_payment_idx").on(t.mouPaymentId),
  ]
);

/** Immutable admin audit trail for allocation and duplicate decisions. */
export const donationReviews = pgTable(
  "donation_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    donationId: uuid("donation_id")
      .notNull()
      .references(() => donations.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    previousAllocations: jsonb("previous_allocations")
      .$type<DonationAllocationSnapshot[]>()
      .notNull()
      .default([]),
    nextAllocations: jsonb("next_allocations")
      .$type<DonationAllocationSnapshot[]>()
      .notNull()
      .default([]),
    reason: text("reason"),
    actorId: text("actor_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("donation_reviews_donation_idx").on(t.donationId, t.createdAt),
  ]
);
