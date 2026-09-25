import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { fileAttachments, files } from "./files";
import { projects } from "./projects";
import { projectUpdates } from "./project-updates";
import { tasks } from "./tasks";
import { partnerContacts, partners } from "./partners";
import { rightsContacts, rightsHolders } from "./rights";
import {
  emailDirection,
  emailProjectSuggestionStatus,
  emailTaskActionKind,
  emailTaskFeedbackSignal,
  emailTaskRuleScope,
  emailTaskRuleStatus,
  emailTaskSuggestionMode,
  emailThreadStatus,
  gmailConnectionType,
  projectKind,
  videoProductionMode,
} from "./enums";

export type EmailRightsReviewKind =
  | "signed_agreement"
  | "license_fee_receipt";
export type EmailRightsReviewStatus =
  | "pending"
  | "processing"
  | "ready"
  | "approved"
  | "dismissed"
  | "failed";
export type EmailRightsReviewProposal = {
  kind: EmailRightsReviewKind;
  confidence: number;
  reason: string;
  agreement?: {
    step: "mou" | "license";
    agreementType: "mou_only" | "mou_plus_license" | "license_only";
    signedDate: string | null;
    holderName: string | null;
    holderId: string | null;
    territory: string | null;
    commercialGranted: boolean;
    formats: {
      print: boolean;
      ebook: boolean;
      audio: boolean;
      video: boolean;
    };
  };
  payment?: {
    amount: number | null;
    currency: string | null;
    paidDate: string | null;
    reference: string | null;
    suggestedPaymentId: string | null;
  };
};

/**
 * A captured email conversation. Provider thread identity is preferred when
 * available, with the RFC parent chain kept as a transport-neutral fallback.
 * `gmailThreadId` is the legacy RFC-root grouping key retained for compatibility.
 * Threads are
 * ingested from a shared capture mailbox (people CC/BCC/forward it) and linked
 * to the project / publisher they concern so correspondence lives beside the
 * rights record it belongs to. `projectId` null = "needs linking" (surfaced in
 * the inbox for a human to resolve). Attribution of who *owns* the thread stays
 * with a human (`ownerUserId`), matching the BCC-to-CRM pattern — the app is
 * never the owner.
 */
export const emailThreads = pgTable(
  "email_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Legacy RFC root Message-ID grouping key. Kept for existing rows/callers.
    gmailThreadId: text("gmail_thread_id").notNull().unique(),
    // Provider conversation id (Gmail X-GM-THRID today), scoped to the mailbox.
    providerThreadId: text("provider_thread_id"),
    // Which capture mailbox this was ingested from (e.g. projects@example.net).
    mailbox: text("mailbox").notNull(),
    subject: text("subject"),
    status: emailThreadStatus("status").notNull().default("open"),
    lastMessageAt: timestamp("last_message_at"),
    lastDirection: emailDirection("last_direction"),
    // The human who owns/handles this thread (defaults to the attributed sender).
    ownerUserId: text("owner_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    assigneeId: text("assignee_id").references(() => user.id, {
      onDelete: "set null",
    }),
    // ── links to the system of record (any may be null) ──
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    holderId: uuid("holder_id").references(() => rightsHolders.id, {
      onDelete: "set null",
    }),
    contactId: uuid("contact_id").references(() => rightsContacts.id, {
      onDelete: "set null",
    }),
    partnerId: uuid("partner_id").references(() => partners.id, {
      onDelete: "set null",
    }),
    partnerContactId: uuid("partner_contact_id").references(
      () => partnerContacts.id,
      { onDelete: "set null" }
    ),
    // A human explicitly set/confirmed the link, so auto-linking won't override it.
    linkedManually: boolean("linked_manually").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("email_threads_project_idx").on(t.projectId),
    index("email_threads_holder_idx").on(t.holderId),
    index("email_threads_partner_idx").on(t.partnerId),
    index("email_threads_mailbox_idx").on(t.mailbox, t.lastMessageAt),
    index("email_threads_status_idx").on(t.status, t.lastMessageAt),
    uniqueIndex("email_threads_provider_thread_uq").on(
      t.mailbox,
      t.providerThreadId
    ),
  ]
);

/**
 * Many-to-many link between a captured thread and the projects it concerns. One
 * email can spawn several projects (e.g. a funding email covering two booklets),
 * and the same correspondence should surface under each. `emailThreads.projectId`
 * stays as the "primary" link (a backward-compatible mirror of the oldest link)
 * so existing single-project readers keep working; this table is the source of
 * truth for "every project a thread is linked to" and "every thread for a
 * project". Every writer that sets `projectId` also upserts a row here.
 */
export const emailThreadProjects = pgTable(
  "email_thread_projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => emailThreads.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // A human explicitly set/confirmed the link (vs. an auto-link).
    linkedManually: boolean("linked_manually").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("email_thread_projects_pair_idx").on(t.threadId, t.projectId),
    index("email_thread_projects_project_idx").on(t.projectId),
  ]
);

/**
 * An AI-detected candidate for a new project extracted from an unlinked inbound
 * thread. One thread can yield several candidates. These are suggestion-only and
 * decoupled from notification read-state: the review screen reads `pending` rows
 * directly, so opening (and thereby reading) the notification never hides the
 * call-to-action. A manager creates or dismisses each; `created`/`dismissed` rows
 * are preserved across reprocessing (only `pending` rows are replaced).
 */
export const emailProjectSuggestions = pgTable(
  "email_project_suggestions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => emailThreads.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    kind: projectKind("kind").notNull().default("other"),
    videoProductionMode: videoProductionMode("video_production_mode"),
    reason: text("reason").notNull().default(""),
    confidence: numeric("confidence").notNull().default("0"),
    status: emailProjectSuggestionStatus("status").notNull().default("pending"),
    // Why a manager dismissed this suggestion (optional free text). Captured as
    // human ground truth and fed to the email-signal reflection pass so the
    // intake AI can learn what is NOT a new project.
    dismissReason: text("dismiss_reason"),
    // Set once a manager creates the project from this candidate.
    createdProjectId: uuid("created_project_id").references(
      () => projects.id,
      { onDelete: "set null" }
    ),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("email_project_suggestions_thread_idx").on(t.threadId, t.status),
  ]
);

/**
 * Review-first project status copy suggested from a concrete captured message.
 * Notification read-state is deliberately separate: the suggestion remains
 * pending until a manager posts or dismisses it.
 */
export const emailProjectUpdateSuggestions = pgTable(
  "email_project_update_suggestions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => emailThreads.id, { onDelete: "cascade" }),
    messageId: uuid("message_id")
      .notNull()
      .references(() => emailMessages.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    suggestedBody: text("suggested_body").notNull(),
    reason: text("reason").notNull().default(""),
    status: emailProjectSuggestionStatus("status").notNull().default("pending"),
    createdUpdateId: uuid("created_update_id").references(
      () => projectUpdates.id,
      { onDelete: "set null" }
    ),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("email_project_update_suggestions_message_project_uq").on(
      t.messageId,
      t.projectId
    ),
    index("email_project_update_suggestions_thread_status_idx").on(
      t.threadId,
      t.status
    ),
  ]
);

/**
 * Human-approved "negative lesson" about what is NOT a new project, learned from
 * managers dismissing wrong intake suggestions. A lighter mirror of
 * `assistant_lessons`: an offline reflection pass proposes `candidate` rules
 * grounded in recent dismissals; an admin must `approved` each one before it is
 * ever injected into the intake prompt. Nothing here is auto-active — reflection
 * can only create candidates, never activate them. `rejected`/`retired` are the
 * terminal states for a candidate an admin declined or an approved rule an admin
 * turned off. Lesson text is kept to 12–500 chars in code (the gate).
 */
export const emailSignalLessons = pgTable(
  "email_signal_lessons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lesson: text("lesson").notNull(),
    status: text("status").notNull().default("candidate"),
    confidence: real("confidence"),
    evidenceCount: integer("evidence_count").notNull().default(1),
    evidenceRefs: jsonb("evidence_refs").$type<string[]>().notNull().default([]),
    reflectionAt: timestamp("reflection_at"),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    approvedBy: text("approved_by").references(() => user.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("email_signal_lessons_status_idx").on(t.status, t.createdAt)]
);

/**
 * One message within a thread. `gmailMessageId` (unique) is the idempotency key
 * so re-processing a history delta never double-inserts. `attributedUserId` is
 * the app user matched from the `From:` address (BCC-to-CRM attribution).
 * Attachments reuse the polymorphic `files` + `file_attachments` tables with
 * target type `email_message` (targetId = this row's id).
 */
export const emailMessages = pgTable(
  "email_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => emailThreads.id, { onDelete: "cascade" }),
    gmailMessageId: text("gmail_message_id").notNull().unique(),
    direction: emailDirection("direction").notNull(),
    fromAddr: text("from_addr"),
    toAddrs: text("to_addrs").array(),
    ccAddrs: text("cc_addrs").array(),
    subject: text("subject"),
    // RFC 5322 Message-ID header — set as In-Reply-To/References when we reply
    // (provider conversation ids are mailbox-local, while RFC reply headers
    // carry the relationship across participants and providers).
    messageIdHeader: text("message_id_header"),
    // RFC reply graph retained so replies can preserve the complete chain and
    // provider-less ingestion can attach a message to an existing thread.
    inReplyToHeader: text("in_reply_to_header"),
    referenceHeaders: text("reference_headers").array(),
    // Provider conversation id as observed on this individual message.
    providerThreadId: text("provider_thread_id"),
    snippet: text("snippet"),
    bodyText: text("body_text"),
    bodyHtml: text("body_html"),
    // App user matched from `fromAddr`; the sender who "owns" this message.
    attributedUserId: text("attributed_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    // Authenticated teammate who forwarded the original message into the
    // capture mailbox. Kept separate from original-sender attribution so a
    // task can safely default to the person who deliberately submitted it.
    forwardedByUserId: text("forwarded_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    // Text the teammate wrote above the forwarded-message marker. This is the
    // only part of a forwarded body treated as trusted user intent.
    forwarderNote: text("forwarder_note"),
    // Gmail historyId at ingest (string; can exceed JS safe-int range) — cursor/debug.
    historyId: text("history_id"),
    // Storage key of the original `.eml` (email/raw/<sha256(Message-ID)>.eml),
    // kept so attachments can be repaired without re-fetching over IMAP.
    // Null for messages captured before raw retention.
    rawObjectKey: text("raw_object_key"),
    sentAt: timestamp("sent_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("email_messages_thread_idx").on(t.threadId, t.sentAt),
    index("email_messages_attributed_idx").on(t.attributedUserId),
  ]
);

/**
 * Durable, review-first proposals extracted from project-linked correspondence
 * PDFs. AI may classify and prefill a signed agreement or license-fee receipt,
 * but only a manager approval mutates rights or payment records.
 */
export const emailRightsReviews = pgTable(
  "email_rights_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => emailThreads.id, { onDelete: "cascade" }),
    messageId: uuid("message_id")
      .notNull()
      .references(() => emailMessages.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    attachmentId: uuid("attachment_id")
      .notNull()
      .references(() => fileAttachments.id, { onDelete: "cascade" }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    kind: text("kind").$type<EmailRightsReviewKind>(),
    proposal: jsonb("proposal").$type<EmailRightsReviewProposal>(),
    status: text("status")
      .$type<EmailRightsReviewStatus>()
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    model: text("model"),
    error: text("error"),
    reviewedBy: text("reviewed_by").references(() => user.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("email_rights_reviews_attachment_project_uq").on(
      t.attachmentId,
      t.projectId
    ),
    index("email_rights_reviews_thread_status_idx").on(t.threadId, t.status),
    index("email_rights_reviews_queue_idx").on(t.status, t.updatedAt),
  ]
);

/**
 * One active external-response watch per correspondence thread. The record is
 * replaced when another outbound message is sent and resolved when a reply is
 * received or a manager closes it. It deliberately stays separate from tasks:
 * waiting on a reply is project context until a person decides it is work.
 */
export const emailFollowUps = pgTable(
  "email_follow_ups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => emailThreads.id, { onDelete: "cascade" }),
    sourceMessageId: uuid("source_message_id")
      .notNull()
      .references(() => emailMessages.id, { onDelete: "cascade" }),
    ownerUserId: text("owner_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    counterparty: text("counterparty"),
    summary: text("summary").notNull(),
    dueAt: timestamp("due_at").notNull(),
    snoozedUntil: timestamp("snoozed_until"),
    notifiedAt: timestamp("notified_at"),
    resolvedAt: timestamp("resolved_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("email_follow_ups_thread_uq").on(t.threadId),
    index("email_follow_ups_due_idx").on(t.resolvedAt, t.dueAt),
    index("email_follow_ups_owner_idx").on(t.ownerUserId, t.resolvedAt, t.dueAt),
  ]
);

/**
 * Durable, reviewable task proposal from captured email. The row survives
 * creation/dismissal so it is both an idempotency key and task provenance.
 */
export const emailTaskSuggestions = pgTable(
  "email_task_suggestions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => emailThreads.id, { onDelete: "cascade" }),
    messageId: uuid("message_id")
      .notNull()
      .references(() => emailMessages.id, { onDelete: "cascade" }),
    // Historical column name: this is the teammate who owns review of the
    // suggestion (the internal forwarder or an unambiguous direct recipient).
    forwarderUserId: text("forwarder_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    assignedTo: text("assigned_to")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    actionKind: emailTaskActionKind("action_kind").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    dueDate: date("due_date"),
    priority: text("priority").notNull().default("medium"),
    primaryUrl: text("primary_url"),
    primaryUrlLabel: text("primary_url_label"),
    sourceSubject: text("source_subject"),
    sourceSender: text("source_sender"),
    // The original message date from forwarded headers when available. This
    // stays separate from the capture/forward timestamp so old requests are
    // recognizable during task review.
    sourceEmailDate: date("source_email_date"),
    confidence: real("confidence").notNull(),
    reason: text("reason").notNull().default(""),
    explicitIntentEvidence: text("explicit_intent_evidence"),
    mode: emailTaskSuggestionMode("mode").notNull(),
    candidateKey: text("candidate_key").notNull(),
    status: emailProjectSuggestionStatus("status").notNull().default("pending"),
    createdTaskId: uuid("created_task_id").references(() => tasks.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("email_task_suggestions_message_key_uq").on(
      t.messageId,
      t.candidateKey
    ),
    uniqueIndex("email_task_suggestions_created_task_uq").on(t.createdTaskId),
    index("email_task_suggestions_forwarder_status_idx").on(
      t.forwarderUserId,
      t.status,
      t.createdAt
    ),
    index("email_task_suggestions_thread_status_idx").on(
      t.threadId,
      t.status
    ),
  ]
);

/** Immutable evidence comparing the AI proposal with the settled user choice. */
export const emailTaskFeedback = pgTable(
  "email_task_feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    suggestionId: uuid("suggestion_id")
      .notNull()
      .references(() => emailTaskSuggestions.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    signal: emailTaskFeedbackSignal("signal").notNull(),
    originalSnapshot: jsonb("original_snapshot")
      .$type<Record<string, unknown>>()
      .notNull(),
    finalSnapshot: jsonb("final_snapshot").$type<Record<string, unknown>>(),
    reason: text("reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("email_task_feedback_user_created_idx").on(t.userId, t.createdAt),
    index("email_task_feedback_suggestion_idx").on(t.suggestionId),
  ]
);

/** Human-approved structured preferences learned from repeated task feedback. */
export const emailTaskRules = pgTable(
  "email_task_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: emailTaskRuleScope("scope").notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    ruleKey: text("rule_key").notNull(),
    explanation: text("explanation").notNull(),
    condition: jsonb("condition").$type<Record<string, unknown>>().notNull(),
    effect: jsonb("effect").$type<Record<string, unknown>>().notNull(),
    status: emailTaskRuleStatus("status").notNull().default("candidate"),
    evidenceCount: integer("evidence_count").notNull().default(0),
    evidenceRefs: jsonb("evidence_refs").$type<string[]>().notNull().default([]),
    approvedBy: text("approved_by").references(() => user.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("email_task_rules_scope_user_key_uq").on(
      t.scope,
      t.userId,
      t.ruleKey
    ),
    index("email_task_rules_status_idx").on(t.status, t.createdAt),
  ]
);

/**
 * Connection + sync state for a Gmail mailbox the app talks to. The shared
 * capture mailbox uses `dwd` (service-account impersonation); per-user send-as
 * connections use `oauth` (row per user). `historyId` is the last processed
 * cursor for incremental `history.list`; `watchExpiresAt` drives the ≤7-day
 * `users.watch` renewal from the daily cron.
 */
export const gmailAccounts = pgTable(
  "gmail_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mailbox: text("mailbox").notNull().unique(),
    connectionType: gmailConnectionType("connection_type")
      .notNull()
      .default("dwd"),
    // Set for oauth connections (the app user whose Google account this is).
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    historyId: text("history_id"),
    watchExpiresAt: timestamp("watch_expires_at"),
    lastSyncedAt: timestamp("last_synced_at"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("gmail_accounts_user_idx").on(t.userId)]
);
