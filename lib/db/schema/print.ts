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
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { user } from "./auth";
import { emailMessages, emailThreads } from "./email";
import { files } from "./files";
import { projects } from "./projects";
import type { PrintReviewFlag } from "@/lib/print/review-flags";

/** Printer/vendor contacts used to identify print correspondence and RFQs. */
export const printContacts = pgTable(
  "print_contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    company: text("company"),
    email: text("email"),
    domain: text("domain"),
    phone: text("phone"),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("print_contacts_email_uq").on(t.email),
    index("print_contacts_active_idx").on(t.isActive),
  ]
);

/** Project-level defaults for print estimation and finance email requests. */
export const projectPrintSettings = pgTable(
  "project_print_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    defaultContactId: uuid("default_contact_id").references(() => printContacts.id, {
      onDelete: "set null",
    }),
    trimWidthIn: numeric("trim_width_in", { precision: 6, scale: 2 })
      .notNull()
      .default("6.00"),
    trimHeightIn: numeric("trim_height_in", { precision: 6, scale: 2 })
      .notNull()
      .default("9.00"),
    measurementUnit: text("measurement_unit").notNull().default("in"),
    languageExpansionFactor: numeric("language_expansion_factor", {
      precision: 5,
      scale: 2,
    })
      .notNull()
      .default("1.50"),
    financialEmail: text("financial_email")
      .notNull()
      .default(""),
    ccEmails: text("cc_emails").array(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("project_print_settings_project_uq").on(t.projectId)]
);

/** One print job/edition/reprint for a project. */
export const printRuns = pgTable(
  "print_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sourceRunId: uuid("source_run_id").references(
      (): AnyPgColumn => printRuns.id,
      {
        onDelete: "set null",
      }
    ),
    contactId: uuid("contact_id").references(() => printContacts.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    kind: text("kind").notNull().default("first_print"),
    printNumber: integer("print_number"),
    status: text("status").notNull().default("planning"),
    campaignStartDate: date("campaign_start_date"),
    campaignDueDate: date("campaign_due_date"),
    fundingGoal: numeric("funding_goal", { precision: 14, scale: 2 }),
    fundingCurrency: text("funding_currency").notNull().default("USD"),
    reprintReason: text("reprint_reason"),
    quantityTarget: integer("quantity_target"),
    requestedQuantities: integer("requested_quantities").array(),
    trimWidthIn: numeric("trim_width_in", { precision: 6, scale: 2 })
      .notNull()
      .default("6.00"),
    trimHeightIn: numeric("trim_height_in", { precision: 6, scale: 2 })
      .notNull()
      .default("9.00"),
    languageExpansionFactor: numeric("language_expansion_factor", {
      precision: 5,
      scale: 2,
    })
      .notNull()
      .default("1.50"),
    estimatedTextPages: integer("estimated_text_pages").notNull().default(0),
    quotedTextPages: integer("quoted_text_pages"),
    coverPages: integer("cover_pages").notNull().default(4),
    textPaper: text("text_paper"),
    coverPaper: text("cover_paper"),
    binding: text("binding"),
    deliveryLocation: text("delivery_location").notNull().default(""),
    latestProofUrl: text("latest_proof_url"),
    notes: text("notes"),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("print_runs_project_idx").on(t.projectId),
    index("print_runs_contact_idx").on(t.contactId),
    index("print_runs_status_idx").on(t.status),
    index("print_runs_kind_idx").on(t.kind, t.status),
    index("print_runs_source_idx").on(t.sourceRunId),
  ]
);

/** A parsed or manually entered quote/invoice from a printer. */
export const printQuotes = pgTable(
  "print_quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    runId: uuid("run_id")
      .notNull()
      .references(() => printRuns.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => printContacts.id, {
      onDelete: "set null",
    }),
    sourceThreadId: uuid("source_thread_id").references(() => emailThreads.id, {
      onDelete: "set null",
    }),
    sourceMessageId: uuid("source_message_id").references(() => emailMessages.id, {
      onDelete: "set null",
    }),
    kind: text("kind").notNull().default("quote"),
    reviewStatus: text("review_status").notNull().default("active"),
    invoiceNumber: text("invoice_number"),
    issueDate: date("issue_date"),
    title: text("title"),
    quantityCps: integer("quantity_cps"),
    unitPrice: numeric("unit_price", { precision: 10, scale: 3 }),
    totalAmount: numeric("total_amount", { precision: 14, scale: 2 }),
    depositAmount: numeric("deposit_amount", { precision: 14, scale: 2 }),
    balanceAmount: numeric("balance_amount", { precision: 14, scale: 2 }),
    currency: text("currency").notNull().default("USD"),
    trimWidthMm: numeric("trim_width_mm", { precision: 8, scale: 2 }),
    trimHeightMm: numeric("trim_height_mm", { precision: 8, scale: 2 }),
    textPages: integer("text_pages"),
    coverPages: integer("cover_pages"),
    textSpec: text("text_spec"),
    coverSpec: text("cover_spec"),
    binding: text("binding"),
    deliveryLocation: text("delivery_location"),
    paymentTerms: text("payment_terms"),
    rawExtract: jsonb("raw_extract"),
    // Fields a manager should double-check (AI/regex disagreement, total mismatch,
    // assumed currency, ambiguous date). Empty/null = nothing to review.
    reviewFlags: jsonb("review_flags").$type<PrintReviewFlag[]>(),
    // How this quote's values were produced: "ai" | "pdf_ai" | "regex_fallback" |
    // "regex" | "manual". Null on legacy rows.
    extractionSource: text("extraction_source"),
    acceptedAt: timestamp("accepted_at"),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("print_quotes_project_idx").on(t.projectId),
    index("print_quotes_run_idx").on(t.runId),
    index("print_quotes_review_idx").on(t.reviewStatus),
    uniqueIndex("print_quotes_suggested_tier_uq")
      .on(
        t.runId,
        sql`(case when ${t.kind} in ('quote', 'invoice') then 'quote_or_invoice' else ${t.kind} end)`,
        t.quantityCps
      )
      .where(sql`${t.reviewStatus} = 'suggested' and ${t.quantityCps} is not null`),
  ]
);

/** Deposit/final/custom payments owed to the printer. */
export const printPayments = pgTable(
  "print_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    runId: uuid("run_id")
      .notNull()
      .references(() => printRuns.id, { onDelete: "cascade" }),
    quoteId: uuid("quote_id").references(() => printQuotes.id, {
      onDelete: "set null",
    }),
    kind: text("kind").notNull().default("custom"),
    status: text("status").notNull().default("planned"),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"),
    currency: text("currency").notNull().default("USD"),
    dueDate: date("due_date"),
    neededByDate: date("needed_by_date"),
    wireRequestedAt: timestamp("wire_requested_at"),
    wireEmailThreadId: uuid("wire_email_thread_id").references(() => emailThreads.id, {
      onDelete: "set null",
    }),
    paidAt: timestamp("paid_at"),
    paidBy: text("paid_by").references(() => user.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("print_payments_project_idx").on(t.projectId),
    index("print_payments_run_idx").on(t.runId),
    index("print_payments_status_idx").on(t.status, t.dueDate),
  ]
);

/** Print-specific thread matching, separate from rights/MoU correspondence. */
export const printThreadLinks = pgTable(
  "print_thread_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => emailThreads.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    contactId: uuid("contact_id").references(() => printContacts.id, {
      onDelete: "set null",
    }),
    runId: uuid("run_id").references(() => printRuns.id, { onDelete: "set null" }),
    matchedBy: text("matched_by").notNull().default("participant"),
    latestProofUrl: text("latest_proof_url"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("print_thread_links_thread_uq").on(t.threadId),
    index("print_thread_links_project_idx").on(t.projectId),
    index("print_thread_links_contact_idx").on(t.contactId),
  ]
);

/**
 * One attempt to extract a printer quote from an email body ("email_text") or an
 * attached invoice PDF/image ("pdf"). Gives auto-extraction (which runs detached
 * in `after()`) durable status so failures are visible and retryable in the print
 * manager, and provides idempotency so re-ingesting or reprocessing a thread
 * doesn't duplicate work.
 */
export const printExtractionJobs = pgTable(
  "print_extraction_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    runId: uuid("run_id").references(() => printRuns.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // "pdf" | "email_text"
    fileId: uuid("file_id").references(() => files.id, { onDelete: "set null" }),
    sourceThreadId: uuid("source_thread_id").references(() => emailThreads.id, {
      onDelete: "set null",
    }),
    sourceMessageId: uuid("source_message_id").references(() => emailMessages.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("pending"), // pending | succeeded | failed
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    quoteId: uuid("quote_id").references(() => printQuotes.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("print_extraction_jobs_run_idx").on(t.runId, t.status),
    index("print_extraction_jobs_project_idx").on(t.projectId, t.status),
    index("print_extraction_jobs_message_idx").on(t.sourceMessageId),
  ]
);

/**
 * Team-wide learned style for AI-drafted operational emails. One row per email
 * `operation` (draft_print_rfq | draft_wire_request). `lessons` is a short,
 * human-readable set of durable preferences distilled from how managers edit
 * the AI's drafts before sending, then injected back into future drafts so each
 * one starts closer to how the team actually writes. Facts specific to a single
 * email (amounts, names) are deliberately excluded when distilling.
 */
export const printEmailLessons = pgTable(
  "print_email_lessons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    operation: text("operation").notNull(),
    lessons: text("lessons").notNull().default(""),
    sampleCount: integer("sample_count").notNull().default(0),
    lastActorId: text("last_actor_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("print_email_lessons_operation_uq").on(t.operation)]
);
