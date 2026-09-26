import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { teamRole, user } from "./auth";

/**
 * Invite-only signup gating. The raw token is emailed; only its hash is stored.
 * A partial unique index enforces at most one *pending* invite per email.
 */
export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    role: teamRole("role").notNull().default("member"),
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: text("invited_by").references(() => user.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at").notNull(),
    acceptedAt: timestamp("accepted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("invitations_pending_email_uq")
      .on(t.email)
      .where(sql`${t.acceptedAt} is null`),
  ]
);

/**
 * The manageable list of per-project role types / pipeline-stage coordinators
 * (Translation, First Draft Edit, Proofreader, …). `defaultDurationDays` seeds
 * the due-date cascade when a stage advances.
 */
export const projectRoles = pgTable("project_roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  color: text("color"),
  sortOrder: integer("sort_order").notNull().default(0),
  defaultDurationDays: integer("default_duration_days"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Which roles a person can do — on which work path — and how many projects they
 * can carry at once in that role on that path. Set by managers/admins. A person
 * may staff only Books, only the shared creative-media path, or both, at different
 * capacities. Together across everyone, this is the team's per-path, per-role
 * staffing capacity — the input to each path's bottleneck view and to realistic
 * due-date prediction. Absence of a row means the person doesn't do that role on
 * that path. `capacityGroupKey` references a `workspaceSettings.capacityGroups`
 * entry's `key`.
 */
export const userRoleCapacity = pgTable(
  "user_role_capacity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    projectRoleId: uuid("project_role_id")
      .notNull()
      .references(() => projectRoles.id, { onDelete: "cascade" }),
    capacityGroupKey: text("capacity_group_key").notNull().default("books"),
    projectsAtOnce: integer("projects_at_once").notNull().default(1),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("user_role_capacity_unique").on(
      t.userId,
      t.projectRoleId,
      t.capacityGroupKey
    ),
  ]
);

/**
 * Workspace-wide branding singleton (`id="workspace"`, like `aiUsageSettings`).
 * `logoFileId` holds a `files.id` (bytes in R2, fetched with getObjectBuffer),
 * following the `user.image` precedent. Used to brand the generated quotation
 * Excel and MoU proposals.
 */
export const workspaceSettings = pgTable("workspace_settings", {
  id: text("id").primaryKey().default("workspace"),
  documentLearningEnabled: boolean("document_learning_enabled").notNull().default(true),
  logoFileId: text("logo_file_id"),
  accentColor: text("accent_color").notNull().default("#B65C3A"),
  orgName: text("org_name"),
  legalName: text("legal_name"),
  orgAliases: text("org_aliases")
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  internalEmailDomains: text("internal_email_domains")
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  timezone: text("timezone").notNull().default("UTC"),
  sourceLanguage: text("source_language"),
  targetLanguage: text("target_language"),
  defaultTerritory: text("default_territory"),
  defaultCurrency: text("default_currency").notNull().default("USD"),
  defaultPlanTemplateKey: text("default_plan_template_key"),
  missionContext: text("mission_context"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  addressLine1: text("address_line_1"),
  addressLine2: text("address_line_2"),
  addressCity: text("address_city"),
  addressRegion: text("address_region"),
  addressPostalCode: text("address_postal_code"),
  addressCountry: text("address_country"),
  registrationNumber: text("registration_number"),
  taxId: text("tax_id"),
  paymentInstructions: text("payment_instructions"),
  invoicePaymentDetails: jsonb("invoice_payment_details").$type<{ issuerName?: string; logoFileId?: string | null; title: string; fields: Array<{ label: string; value: string }> }>(),
  preparedByNote: text("prepared_by_note"),
  workDays: integer("work_days")
    .array()
    .notNull()
    .default(sql`ARRAY[1,2,3,4,5]::integer[]`),
  workHoursStart: integer("work_hours_start").notNull().default(480),
  workHoursEnd: integer("work_hours_end").notNull().default(960),
  weeklyDigestDay: integer("weekly_digest_day").notNull().default(1),
  weeklyDigestTime: text("weekly_digest_time").notNull().default("09:00"),
  externalFollowUpBusinessDays: integer("external_follow_up_business_days")
    .notNull()
    .default(3),
  wordsPerPage: integer("words_per_page").notNull().default(217),
  languageExpansionFactor: numeric("language_expansion_factor", {
    precision: 5,
    scale: 2,
  })
    .notNull()
    .default("1.50"),
  trimWidthIn: numeric("trim_width_in", { precision: 6, scale: 2 })
    .notNull()
    .default("6.00"),
  trimHeightIn: numeric("trim_height_in", { precision: 6, scale: 2 })
    .notNull()
    .default("9.00"),
  defaultDeliveryLocation: text("default_delivery_location"),
  financialEmail: text("financial_email"),
  defaultCcEmails: text("default_cc_emails")
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  fundingAccountLabel: text("funding_account_label"),
  /** Default fee/deduction withheld from incoming funding, in basis points. */
  defaultFundingDeductionBps: integer("default_funding_deduction_bps")
    .notNull()
    .default(1300),
  // Sastra is an operational copy, not the donation system of record. Each
  // import snapshots this workspace retention period for its source CSV.
  donationSourceRetentionDays: integer("donation_source_retention_days")
    .notNull()
    .default(30),
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
  // Planning capacity — how many projects the team runs at once, and the
  // typical start-to-finish months per project kind. Drives the proposed-
  // completion-date planner; admin-tunable as real completion data accrues.
  projectsConcurrent: integer("projects_concurrent").notNull().default(3),
  // Capacity groups (work paths): concurrency is set per group; a project's
  // kind maps to a group. Duration stays per kind (below). Books are their own
  // path; articles, podcasts, and video series share one. Admin-editable, portable.
  capacityGroups: jsonb("capacity_groups")
    .$type<{ key: string; name: string; concurrency: number; kinds: string[] }[]>()
    .notNull()
    .default(
      sql`'[{"key":"books","name":"Books","concurrency":3,"kinds":["book"]},{"key":"media","name":"Creative media","concurrency":3,"kinds":["article","podcast","video_series","other"]}]'::jsonb`
    ),
  durationMonthsBook: integer("duration_months_book").notNull().default(18),
  durationMonthsArticle: integer("duration_months_article").notNull().default(8),
  durationMonthsPodcast: integer("duration_months_podcast").notNull().default(10),
  durationMonthsVideoSeries: integer("duration_months_video_series")
    .notNull()
    .default(10),
  durationMonthsOther: integer("duration_months_other").notNull().default(12),
  setupCompletedAt: timestamp("setup_completed_at"),
  updatedBy: text("updated_by").references(() => user.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/** Per-user email opt-in flags + unsubscribe token (EMAILSERVICE.md). */
export const emailPreferences = pgTable("email_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  workflowOptIn: boolean("workflow_opt_in").notNull().default(true),
  standupOptIn: boolean("standup_opt_in").notNull().default(true),
  // Optional notification mail is queued and delivered on this cadence.
  emailDeliveryMode: text("email_delivery_mode").notNull().default("bundled"),
  // User-local minutes after midnight. Daily digests run Monday-Friday.
  emailDigestTimeMinutes: integer("email_digest_time_minutes")
    .notNull()
    .default(480),
  unsubscribeToken: text("unsubscribe_token").notNull().unique(),
  // Push quiet hours (minutes-of-day in the user's timezone) + out-of-office pause.
  quietHoursEnabled: boolean("quiet_hours_enabled").notNull().default(false),
  quietHoursStart: integer("quiet_hours_start").notNull().default(1320), // 22:00
  quietHoursEnd: integer("quiet_hours_end").notNull().default(420), // 07:00
  pushPausedUntil: timestamp("push_paused_until"),
  // How quiet hours are configured in the UI: "off" (always), "quiet" (silence a
  // window), or "work" (only notify during work hours — stored as the complement
  // quiet window). work_hours_* are minutes-of-day; workspace defaults seed new users.
  pushScheduleMode: text("push_schedule_mode").notNull().default("off"),
  workHoursStart: integer("work_hours_start").notNull().default(480), // 08:00
  workHoursEnd: integer("work_hours_end").notNull().default(960), // 16:00
  // Opt-in: only deliver push while the user is actively present (Part: presence).
  pushOnlyWhenActive: boolean("push_only_when_active").notNull().default(false),
  // Low-urgency AI correspondence reviews stay in-app/dashboard by default.
  // Users who want immediate review nudges can explicitly opt into push.
  pushReviewSuggestions: boolean("push_review_suggestions")
    .notNull()
    .default(false),
  // Forwarded-email task assistant controls. Suggestions and learning are
  // separate so a user can keep task capture while disabling personalization.
  emailTaskSuggestionsEnabled: boolean("email_task_suggestions_enabled")
    .notNull()
    .default(true),
  emailTaskLearningEnabled: boolean("email_task_learning_enabled")
    .notNull()
    .default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
