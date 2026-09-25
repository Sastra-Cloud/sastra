import { pgEnum } from "drizzle-orm/pg-core";

export const projectStatus = pgEnum("project_status", [
  "proposal",
  "planning",
  "active",
  "on_hold",
  "completed",
  "cancelled",
]);

export const projectKind = pgEnum("project_kind", [
  "book",
  "article",
  "podcast",
  "other",
  // Episodic video series (e.g. a run of testimony or course videos). Mirrors
  // `podcast`: its units are episodes driven through the same production stages.
  "video_series",
]);

/** Manually maintained operational readiness for printing a book project. */
export const printFundingStatus = pgEnum("print_funding_status", [
  "not_assessed",
  "no_funding",
  "seeking_funding",
  "partially_funded",
  "funded",
  "not_required",
]);

/** Editorial origin of a video series. Existing video projects default original. */
export const videoProductionMode = pgEnum("video_production_mode", [
  "original",
  "translation",
]);

/**
 * Publishing state of a project sub-unit. Meaningful for podcast episodes;
 * article collections currently derive production progress from linked tasks.
 * Book chapters and other units stay at the default `draft`.
 */
export const unitStatus = pgEnum("unit_status", [
  "draft",
  "scheduled",
  "published",
]);

/**
 * Category of a standing license obligation extracted from an MoU/license, so
 * the team stays compliant (a breach can terminate the license). Broad enough
 * to cover the recurring corpus in `mou-license/` (credit lines, cover/artwork
 * approval, periodic reports, distribution restrictions, sample delivery).
 */
export const obligationKind = pgEnum("obligation_kind", [
  "attribution",
  "copyright_notice",
  "artwork_approval",
  "analytics_report",
  "format_restriction",
  "territory_restriction",
  "sample_delivery",
  "other",
]);

/**
 * How often / when a license obligation must be honored. Drives whether the
 * obligation auto-generates an operational task: the recurring report cadences
 * (`monthly`/`quarterly`/`annual`) → a recurring reminder task; `per_artwork`
 * → one milestone gate task; the rest are production rules surfaced on the
 * Episodes/Overview surfaces (no task).
 */
export const obligationCadence = pgEnum("obligation_cadence", [
  "per_episode",
  "per_artwork",
  "monthly",
  "quarterly",
  "annual",
  "standing",
  "on_publish",
]);

export const priority = pgEnum("priority", [
  "low",
  "medium",
  "high",
  "urgent",
]);

export const taskStatus = pgEnum("task_status", [
  "todo",
  "in_progress",
  "review",
  "done",
]);

/** Fixed production stages for podcast episodes and video-series units. */
export const podcastStage = pgEnum("podcast_stage", [
  "concept_outline",
  "write_script",
  "approve_script",
  "translate_script",
  "approve_translation",
  "record_audio",
  "master_audio",
  "produce_video",
  "approve_video",
  "schedule_episode",
]);

export const fileStatus = pgEnum("file_status", ["pending", "ready", "failed"]);
export const filePurpose = pgEnum("file_purpose", [
  "workspace_attachment",
  "donation_import",
  "system_generated",
  "email_ingest",
]);

export const attachTarget = pgEnum("attach_target", [
  "message",
  "task",
  "rights_item",
  "budget_item",
  "project",
  "email_message",
  "print_quote",
  "print_payment",
  "license_fee_payment",
  "agreement_group",
]);

export const agreementType = pgEnum("agreement_type", [
  "mou_only",
  "mou_plus_license",
  "license_only",
]);

export const rightsStepStatus = pgEnum("rights_step_status", [
  "not_needed",
  "not_started",
  "in_progress",
  "signed",
]);

export const rightsOverall = pgEnum("rights_overall", [
  "none",
  "in_progress",
  "complete",
]);

export const blockerType = pgEnum("blocker_type", [
  "rights",
  "budget",
  "overdue_task",
  "overdue_dependency",
  "stalled_task",
  "schedule",
]);

export const severity = pgEnum("severity", ["warning", "critical"]);

export const channelKind = pgEnum("channel_kind", [
  "project",
  "general",
  "custom",
  "direct",
  "standup",
]);

export const standupRunStatus = pgEnum("standup_run_status", [
  "pending",
  "in_progress",
  "completed",
  "missed",
]);

export const messageStatus = pgEnum("message_status", [
  "sent",
  "uploading",
  "failed",
]);

export const draftStatus = pgEnum("draft_status", [
  "interviewing",
  "ready",
  "committed",
  "discarded",
]);

/** Lifecycle of an AI document import (MOU/license → projects). */
export const importStatus = pgEnum("import_status", [
  "uploaded", // file attached, not yet parsed
  "parsing", // AI extraction in flight
  "extracted", // AI returned, ready for review/edit
  "failed", // extraction or validation failed (see error)
  "committed", // projects created
  "discarded",
]);

export const budgetGroup = pgEnum("budget_group", [
  "book_publishing",
  "additional_media",
]);

export const budgetUnit = pgEnum("budget_unit", [
  "words",
  "pages",
  "cover",
  "project",
  "flat",
]);

export const budgetCategory = pgEnum("budget_category", [
  "translation",
  "proofreading",
  "editing",
  "cover_design",
  "typesetting",
  "project_management",
  "print_ship",
  "audiobook",
  "video_series",
  "custom",
]);

/** Whether an email message was received (inbound) or sent by us (outbound). */
export const emailDirection = pgEnum("email_direction", [
  "inbound",
  "outbound",
]);

/**
 * Workflow state of a captured email thread, mirroring the Google
 * Collaborative-Inbox idea: `open` (needs attention), `waiting` (we replied,
 * awaiting the other party), `done` (resolved/archived).
 */
export const emailThreadStatus = pgEnum("email_thread_status", [
  "open",
  "waiting",
  "done",
]);

/**
 * How the app connects to a mailbox: `imap` = IMAP/SMTP with an app password
 * (the shared capture mailbox); `oauth`/`dwd` reserved for future per-user
 * send-as connections.
 */
export const gmailConnectionType = pgEnum("gmail_connection_type", [
  "imap",
  "dwd",
  "oauth",
]);

/**
 * Lifecycle of an AI-suggested new project extracted from a captured email
 * thread. `pending` = awaiting a manager's decision on the review screen;
 * `created` = a project was created from it (never re-suggested); `dismissed` =
 * a manager rejected it. Only `pending` rows are replaced when a thread is
 * reprocessed, so decisions are preserved.
 */
export const emailProjectSuggestionStatus = pgEnum(
  "email_project_suggestion_status",
  ["pending", "created", "dismissed"]
);

/** Action the email-task reader believes the forwarder needs to take. */
export const emailTaskActionKind = pgEnum("email_task_action_kind", [
  "schedule_meeting",
  "reply",
  "follow_up",
  "review",
  "send",
  "general",
]);

/** Whether trusted forwarding intent allowed immediate creation. */
export const emailTaskSuggestionMode = pgEnum("email_task_suggestion_mode", [
  "explicit_auto",
  "implicit_review",
]);

/** Settled user choices that can become learning evidence. */
export const emailTaskFeedbackSignal = pgEnum("email_task_feedback_signal", [
  "accepted",
  "edited",
  "dismissed",
  "already_done",
  "undone",
]);

/** Personal preferences stay private; shared rules require admin approval. */
export const emailTaskRuleScope = pgEnum("email_task_rule_scope", [
  "user",
  "workspace",
]);

export const emailTaskRuleStatus = pgEnum("email_task_rule_status", [
  "candidate",
  "approved",
  "rejected",
  "retired",
]);
