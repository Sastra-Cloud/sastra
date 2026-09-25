import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  primaryKey,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { projects } from "./projects";
import { files } from "./files";
import { printRuns } from "./print";
import { tasks } from "./tasks";
import { user } from "./auth";
import { emailThreads } from "./email";
import { partnerContacts, partners } from "./partners";
import { budgetCategory, budgetGroup, budgetUnit } from "./enums";
import { sharedMouGroups, sharedMouMemberships } from "./agreements";

/** Itemized quotation line (QTY × unit price = amount), grouped + funded. */
export const budgetItems = pgTable(
  "budget_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    printRunId: uuid("print_run_id").references(() => printRuns.id, {
      onDelete: "set null",
    }),
    group: budgetGroup("group").notNull().default("book_publishing"),
    category: budgetCategory("category").notNull().default("custom"),
    label: text("label").notNull(),
    /** Optional partner-safe wording; internal label remains the source of truth. */
    partnerLabel: text("partner_label"),
    /** Optional public rate override used only in partner-facing quotations. */
    partnerUnitPrice: numeric("partner_unit_price", { precision: 14, scale: 4 }),
    partnerVisible: boolean("partner_visible").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    unit: budgetUnit("unit").notNull().default("flat"),
    quantity: numeric("quantity", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    unitPrice: numeric("unit_price", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"),
    isAutoQuantity: boolean("is_auto_quantity").notNull().default(true),
    amountSecured: numeric("amount_secured", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    amountSpent: numeric("amount_spent", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    currency: text("currency").notNull().default("USD"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("budget_items_project_idx").on(t.projectId),
    index("budget_items_print_run_idx").on(t.printRunId),
  ]
);

export type BudgetPresentationMode = "itemized" | "per_copy";

/**
 * Partner-facing quotation settings for one budget scope. Existing budgets
 * intentionally have no row until a manager opts them into deduction-aware
 * funding, so migrations never rewrite historical totals.
 */
export const budgetScopePresentations = pgTable(
  "budget_scope_presentations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    printRunId: uuid("print_run_id").references(() => printRuns.id, {
      onDelete: "cascade",
    }),
    mode: text("mode")
      .$type<BudgetPresentationMode>()
      .notNull()
      .default("itemized"),
    deductionBps: integer("deduction_bps").notNull().default(1300),
    publicDescription: text("public_description"),
    perCopyQuantity: integer("per_copy_quantity"),
    perCopyUnitPrice: numeric("per_copy_unit_price", {
      precision: 14,
      scale: 2,
    }),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    updatedBy: text("updated_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("budget_scope_presentations_main_uq")
      .on(t.projectId)
      .where(sql`${t.printRunId} is null`),
    uniqueIndex("budget_scope_presentations_run_uq")
      .on(t.projectId, t.printRunId)
      .where(sql`${t.printRunId} is not null`),
    index("budget_scope_presentations_project_idx").on(t.projectId),
  ]
);

/** Per-project quotation settings: word count, rates, partner info (1:1). */
export const projectBudgetSettings = pgTable(
  "project_budget_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    wordCount: integer("word_count").notNull().default(0),
    sourcePageCount: integer("source_page_count").notNull().default(0),
    wordsPerPage: integer("words_per_page").notNull().default(217),
    currency: text("currency").notNull().default("USD"),
    rateTranslation: numeric("rate_translation", { precision: 10, scale: 4 })
      .notNull()
      .default("0.03"),
    rateProofreading: numeric("rate_proofreading", { precision: 10, scale: 4 })
      .notNull()
      .default("0.01"),
    rateEditing: numeric("rate_editing", { precision: 10, scale: 4 })
      .notNull()
      .default("0.03"),
    rateCoverDesign: numeric("rate_cover_design", { precision: 10, scale: 4 })
      .notNull()
      .default("100"),
    rateTypesetting: numeric("rate_typesetting", { precision: 10, scale: 4 })
      .notNull()
      .default("3"),
    rateProjectManagement: numeric("rate_project_management", {
      precision: 10,
      scale: 4,
    })
      .notNull()
      .default("200"),
    ratePrintShip: numeric("rate_print_ship", { precision: 10, scale: 4 })
      .notNull()
      .default("2000"),
    rateAudiobook: numeric("rate_audiobook", { precision: 10, scale: 4 })
      .notNull()
      .default("0.01"),
    rateVideoSeries: numeric("rate_video_series", { precision: 10, scale: 4 })
      .notNull()
      .default("0.01"),
    partnerName: text("partner_name"),
    // Structured funding contact: first name drives the proposal greeting,
    // email is the proposal recipient; partnerContact stays as a free-text note.
    partnerContactFirstName: text("partner_contact_first_name"),
    partnerContactLastName: text("partner_contact_last_name"),
    partnerContactEmail: text("partner_contact_email"),
    partnerContact: text("partner_contact"),
    // Optional link to the saved Partner directory. The free-text fields above
    // stay populated (from the link or typed) so exports/proposals read one place.
    partnerId: uuid("partner_id").references(() => partners.id, {
      onDelete: "set null",
    }),
    partnerContactId: uuid("partner_contact_id").references(
      () => partnerContacts.id,
      { onDelete: "set null" }
    ),
    workDescription: text("work_description"),
    royaltyRecipientEmail: text("royalty_recipient_email"),
    royaltyDueMonth: integer("royalty_due_month"),
    royaltyDueDay: integer("royalty_due_day"),
    royaltyTaskAssigneeId: text("royalty_task_assignee_id").references(() => user.id, {
      onDelete: "set null",
    }),
    // Recurring royalty payments: cadence + amount per period (currency falls
    // back to the project's `currency` above when null).
    royaltyFrequency: text("royalty_frequency").notNull().default("annual"),
    royaltyAmount: numeric("royalty_amount", { precision: 14, scale: 2 }),
    royaltyCurrency: text("royalty_currency"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("project_budget_settings_project_uq").on(t.projectId)]
);

export type BudgetApprovalRequestStatus =
  | "pending"
  | "approved"
  | "changes_requested"
  | "superseded";
export type BudgetApprovalDecision =
  | "pending"
  | "approved"
  | "changes_requested";

/** One review round for the complete project quotation. */
export const budgetApprovalRequests = pgTable(
  "budget_approval_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    printRunId: uuid("print_run_id").references(() => printRuns.id, {
      onDelete: "cascade",
    }),
    requesterId: text("requester_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    dueDate: date("due_date").notNull(),
    fingerprint: text("fingerprint").notNull(),
    currency: text("currency").notNull(),
    totalAmount: numeric("total_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    status: text("status")
      .$type<BudgetApprovalRequestStatus>()
      .notNull()
      .default("pending"),
    // When a terminal round is superseded, retain what its outcome had been so
    // history can distinguish an approved round from a change-requested one.
    supersededFromStatus: text("superseded_from_status").$type<
      Exclude<BudgetApprovalRequestStatus, "superseded">
    >(),
    approvedAt: timestamp("approved_at"),
    supersededAt: timestamp("superseded_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("budget_approval_requests_project_idx").on(t.projectId, t.createdAt),
    uniqueIndex("budget_approval_requests_current_main_uq")
      .on(t.projectId)
      .where(sql`${t.printRunId} is null and ${t.status} <> 'superseded'`),
    uniqueIndex("budget_approval_requests_current_run_uq")
      .on(t.projectId, t.printRunId)
      .where(sql`${t.printRunId} is not null and ${t.status} <> 'superseded'`),
    index("budget_approval_requests_print_run_idx").on(t.printRunId),
  ]
);

/** One required approver and decision within a budget approval round. */
export const budgetApprovalAssignments = pgTable(
  "budget_approval_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => budgetApprovalRequests.id, { onDelete: "cascade" }),
    approverId: text("approver_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    decision: text("decision")
      .$type<BudgetApprovalDecision>()
      .notNull()
      .default("pending"),
    changeNote: text("change_note"),
    decidedAt: timestamp("decided_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("budget_approval_assignments_request_approver_uq").on(
      t.requestId,
      t.approverId
    ),
    uniqueIndex("budget_approval_assignments_task_uq").on(t.taskId),
    index("budget_approval_assignments_approver_idx").on(t.approverId),
  ]
);

/**
 * History of MoU / funding proposals emailed to a sponsor from a project. Each
 * row captures the recipient, the quoted total, the exact quotation file sent
 * (a `files.id`, bytes in R2), the linked email thread, and a status the manager
 * can advance (sent → accepted / declined).
 */
export const proposalSubmissions = pgTable(
  "proposal_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    printRunId: uuid("print_run_id").references(() => printRuns.id, {
      onDelete: "set null",
    }),
    sentByUserId: text("sent_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    recipientName: text("recipient_name"),
    recipientEmail: text("recipient_email").notNull(),
    ccEmails: jsonb("cc_emails").$type<string[]>(),
    subject: text("subject").notNull(),
    currency: text("currency").notNull().default("USD"),
    totalAmount: numeric("total_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    budgetApprovalRequestId: uuid("budget_approval_request_id").references(
      () => budgetApprovalRequests.id,
      { onDelete: "set null" }
    ),
    budgetApprovalFingerprint: text("budget_approval_fingerprint"),
    fileId: text("file_id"),
    emailThreadId: uuid("email_thread_id").references(() => emailThreads.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("sent"),
    notes: text("notes"),
    sentAt: timestamp("sent_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("proposal_submissions_project_idx").on(t.projectId, t.sentAt),
    index("proposal_submissions_print_run_idx").on(t.printRunId),
  ]
);

/**
 * Outgoing royalty payments owed by the project (e.g. to an author/rights
 * holder), generated per period from the royalty config. Mirrors `mouPayments`
 * but money-out: one `period` per project, an assigned task to handle it, and a
 * `paidAt` once settled.
 */
export const royaltyPayments = pgTable(
  "royalty_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    period: text("period").notNull(), // e.g. "2026", "2026-Q3", "2026-07"
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"),
    currency: text("currency").notNull().default("USD"),
    dueDate: date("due_date"),
    recipientEmail: text("recipient_email"),
    assigneeId: text("assignee_id").references(() => user.id, {
      onDelete: "set null",
    }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    notes: text("notes"),
    paidAt: timestamp("paid_at"),
    paidBy: text("paid_by").references(() => user.id, { onDelete: "set null" }),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("royalty_payments_project_period_uq").on(t.projectId, t.period),
    index("royalty_payments_project_idx").on(t.projectId),
  ]
);

/** Money actually received for a project (funding/payments in), as a ledger. */
export const fundingReceipts = pgTable(
  "funding_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    printRunId: uuid("print_run_id").references(() => printRuns.id, {
      onDelete: "set null",
    }),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"),
    deductionBps: integer("deduction_bps"),
    expectedNetAmount: numeric("expected_net_amount", {
      precision: 14,
      scale: 2,
    }),
    actualNetAmount: numeric("actual_net_amount", {
      precision: 14,
      scale: 2,
    }),
    currency: text("currency").notNull().default("USD"),
    receivedDate: date("received_date"),
    source: text("source"), // who paid (e.g. "9Marks")
    note: text("note"),
    recordedBy: text("recorded_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("funding_receipts_project_idx").on(t.projectId),
    index("funding_receipts_print_run_idx").on(t.printRunId),
  ]
);

/** One authoritative receipt for a shared MoU payment. */
export const sharedMouReceipts = pgTable(
  "shared_mou_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => sharedMouGroups.id, { onDelete: "restrict" }),
    paymentId: uuid("payment_id").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    deductionBps: integer("deduction_bps"),
    expectedNetAmount: numeric("expected_net_amount", {
      precision: 14,
      scale: 2,
    }),
    actualNetAmount: numeric("actual_net_amount", {
      precision: 14,
      scale: 2,
    }),
    currency: text("currency").notNull().default("USD"),
    receivedDate: date("received_date"),
    source: text("source"),
    note: text("note"),
    recordedBy: text("recorded_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("shared_mou_receipts_payment_uq").on(t.paymentId),
    index("shared_mou_receipts_group_idx").on(t.groupId),
  ]
);

/** Reviewed split from one group receipt into project funding ledgers. */
export const sharedMouReceiptAllocations = pgTable(
  "shared_mou_receipt_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    receiptId: uuid("receipt_id")
      .notNull()
      .references(() => sharedMouReceipts.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id").references(
      () => sharedMouMemberships.id,
      { onDelete: "set null" }
    ),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    fundingReceiptId: uuid("funding_receipt_id")
      .notNull()
      .references(() => fundingReceipts.id, { onDelete: "restrict" }),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    actualNetAmount: numeric("actual_net_amount", {
      precision: 14,
      scale: 2,
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("shared_mou_receipt_allocations_receipt_project_uq").on(
      t.receiptId,
      t.projectId
    ),
    uniqueIndex("shared_mou_receipt_allocations_funding_receipt_uq").on(
      t.fundingReceiptId
    ),
    index("shared_mou_receipt_allocations_project_idx").on(t.projectId),
  ]
);

/**
 * Scheduled incoming MoU payments a partner owes the project, distinct from
 * `fundingReceipts` (money actually in). Marking one received sets `paidAt`
 * and links the `fundingReceipts` row it created.
 */
export const mouPayments = pgTable(
  "mou_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sharedMouGroupId: uuid("shared_mou_group_id").references(
      () => sharedMouGroups.id,
      { onDelete: "restrict" }
    ),
    printRunId: uuid("print_run_id").references(() => printRuns.id, {
      onDelete: "set null",
    }),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"),
    currency: text("currency").notNull().default("USD"),
    trigger: text("trigger").notNull().default("custom"),
    dueDate: date("due_date"),
    notes: text("notes"),
    /** Partner-safe invoice description, separate from internal scheduling notes. */
    publicDescription: text("public_description"),
    invoiceAssigneeId: text("invoice_assignee_id").references(() => user.id, {
      onDelete: "set null",
    }),
    invoiceTaskId: uuid("invoice_task_id").references(() => tasks.id, {
      onDelete: "set null",
    }),
    paymentDueDate: date("payment_due_date"),
    deliveryRequirements: jsonb("delivery_requirements").$type<string[]>(),
    deliveryEvidence: jsonb("delivery_evidence").$type<Array<{ requirement: string; url: string; fileId?: string }>>(),
    deliveryConfirmedAt: timestamp("delivery_confirmed_at"),
    deliveryConfirmedBy: text("delivery_confirmed_by").references(() => user.id, { onDelete: "set null" }),
    invoiceRequestedAt: timestamp("invoice_requested_at"),
    readinessStatus: text("readiness_status").notNull().default("locked"),
    readinessReason: text("readiness_reason"),
    readinessEvaluatedAt: timestamp("readiness_evaluated_at"),
    paidAt: timestamp("paid_at"),
    receiptId: uuid("receipt_id").references(() => fundingReceipts.id, {
      onDelete: "set null",
    }),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("mou_payments_project_idx").on(t.projectId),
    index("mou_payments_shared_group_idx").on(t.sharedMouGroupId),
    index("mou_payments_print_run_idx").on(t.printRunId),
  ]
);

/** Projects covered by one agreement-level MoU receivable. */
export const mouPaymentProjects = pgTable(
  "mou_payment_projects",
  {
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => mouPayments.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.paymentId, t.projectId] }),
    index("mou_payment_projects_project_idx").on(t.projectId),
  ]
);

/** Workspace invoice number counter. `nextNumber` is the next value to issue. */
export const invoiceSequences = pgTable("invoice_sequences", {
  id: text("id").primaryKey(),
  prefix: text("prefix").notNull().default(""),
  nextNumber: integer("next_number").notNull().default(1),
  padding: integer("padding").notNull().default(5),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/** Generated invoices for scheduled incoming MoU payments. */
export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    printRunId: uuid("print_run_id").references(() => printRuns.id, {
      onDelete: "set null",
    }),
    mouPaymentId: uuid("mou_payment_id").references(() => mouPayments.id, {
      onDelete: "set null",
    }),
    sharedMouGroupId: uuid("shared_mou_group_id").references(
      () => sharedMouGroups.id,
      { onDelete: "restrict" }
    ),
    invoiceNumber: text("invoice_number").notNull(),
    recipientName: text("recipient_name"),
    recipientEmail: text("recipient_email"),
    recipientAddress: text("recipient_address"),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"),
    currency: text("currency").notNull().default("USD"),
    issueDate: date("issue_date").notNull(),
    dueDate: date("due_date"),
    description: text("description").notNull(),
    notes: text("notes"),
    /** Original uploaded invoice; null for invoices generated by the app. */
    sourceFileId: uuid("source_file_id").references(() => files.id, {
      onDelete: "set null",
    }),
    /** Immutable PDF generated for this invoice version. */
    renderedFileId: uuid("rendered_file_id").references(() => files.id, {
      onDelete: "restrict",
    }),
    status: text("status").notNull().default("issued"),
    voidedAt: timestamp("voided_at"),
    voidedBy: text("voided_by").references(() => user.id, {
      onDelete: "set null",
    }),
    replacesInvoiceId: uuid("replaces_invoice_id"),
    issuerSnapshot: jsonb("issuer_snapshot").$type<{
      orgName: string | null;
      legalName: string | null;
      logoFileId: string | null;
      accentColor: string;
      contactEmail: string | null;
      contactPhone: string | null;
      address: string[];
      registrationNumber: string | null;
      taxId: string | null;
      paymentInstructions: string | null;
      invoicePaymentDetails?: { issuerName?: string; logoFileId?: string | null; title: string; fields: Array<{ label: string; value: string }> } | null;
    }>(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("invoices_number_uq").on(t.invoiceNumber),
    uniqueIndex("invoices_active_mou_payment_uq")
      .on(t.mouPaymentId)
      .where(sql`${t.mouPaymentId} is not null and ${t.status} <> 'void'`),
    index("invoices_project_idx").on(t.projectId),
    index("invoices_shared_group_idx").on(t.sharedMouGroupId),
    index("invoices_print_run_idx").on(t.printRunId),
  ]
);

/** Immutable audit of each external invoice delivery. */
export const invoiceDeliveries = pgTable(
  "invoice_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "restrict" }),
    sentByUserId: text("sent_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    recipientEmail: text("recipient_email").notNull(),
    ccEmails: jsonb("cc_emails").$type<string[]>(),
    evidence: jsonb("evidence").$type<Array<{ requirement: string; url: string; fileId?: string }>>(),
    subject: text("subject").notNull(),
    emailThreadId: uuid("email_thread_id").references(() => emailThreads.id, {
      onDelete: "set null",
    }),
    sentAt: timestamp("sent_at").defaultNow().notNull(),
  },
  (t) => [
    index("invoice_deliveries_invoice_idx").on(t.invoiceId, t.sentAt),
  ]
);
