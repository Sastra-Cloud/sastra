import {
  boolean,
  date,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { projectRoles } from "./app";
import {
  podcastStage,
  priority,
  printFundingStatus,
  projectKind,
  projectStatus,
  unitStatus,
  videoProductionMode,
} from "./enums";

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  targetLanguageTitle: text("target_language_title"),
  sourceLanguage: text("source_language"),
  targetLanguage: text("target_language"),
  description: text("description"),
  // book | article | podcast | video_series | other — drives terminology and workflow.
  kind: projectKind("kind"),
  // A deliberate operational flag for book printing intent and readiness. It
  // stays manual because rights and general project funding cannot determine
  // whether printing is currently planned or funded.
  // Non-book projects retain the default value but do not expose this field.
  printFundingStatus: printFundingStatus("print_funding_status")
    .notNull()
    .default("not_assessed"),
  // Only meaningful for video_series. Null on other kinds; legacy video rows
  // are interpreted as original and backfilled by the migration.
  videoProductionMode: videoProductionMode("video_production_mode"),
  status: projectStatus("status").notNull().default("planning"),
  priority: priority("priority").notNull().default("medium"),
  startDate: date("start_date"),
  dueDate: date("due_date"),
  // How long we plan the work to take, start to finish. Combined with startDate
  // this is the project's *planned* window (start → start + duration), distinct
  // from the contractual deadline (dueDate / rightsItems.completeByDate). Drives
  // the schedule roadmap and the capacity model; null falls back to the
  // workspace per-kind default.
  estimatedDurationMonths: integer("estimated_duration_months"),
  // A completion date we propose to a funder in a proposal/MoU draft when there
  // is no signed agreement yet. Superseded by the agreement's real deadline
  // (rightsItems.completeByDate) once one exists — never used after that.
  proposedCompletionDate: date("proposed_completion_date"),
  mouRequired: boolean("mou_required").notNull().default(false),
  requiresRoyalties: boolean("requires_royalties").notNull().default(false),
  royaltyPercentage: numeric("royalty_percentage", { precision: 5, scale: 2 }),
  // Cached RAG health, written by the blockers engine (M4). Null until computed.
  healthStatus: text("health_status"),
  // When the blockers engine last recomputed health (cron, mutation hook, or
  // manual refresh). Null on legacy rows until the next recompute.
  healthComputedAt: timestamp("health_computed_at"),
  // Google Drive: the project's main working folder (picked via the Drive
  // Picker, so the app is granted access to write into it). We keep only the
  // reference — used to deep-link the folder and as the default upload
  // destination for the project's tasks. Null until a manager links one.
  driveFolderId: text("drive_folder_id"),
  driveFolderName: text("drive_folder_name"),
  driveFolderUrl: text("drive_folder_url"),
  // Default production policy for podcast episodes. Individual episodes may
  // override this without changing the rest of the project.
  videoRequired: boolean("video_required").notNull().default(true),
  createdBy: text("created_by").references(() => user.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/** Who is on a project and in which role(s). A person may hold several roles. */
export const projectMembers = pgTable(
  "project_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    projectRoleId: uuid("project_role_id")
      .notNull()
      .references(() => projectRoles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("project_members_unique").on(
      t.projectId,
      t.userId,
      t.projectRoleId
    ),
  ]
);

/** Sub-units a project fans out into (chapters / articles / episodes / sections). */
export const units = pgTable("units", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  orderIndex: integer("order_index").notNull().default(0),
  // Episode publishing lifecycle (podcast projects). Inert for book chapters /
  // article sections, which stay `draft`.
  status: unitStatus("status").notNull().default("draft"),
  scheduledDate: date("scheduled_date"),
  publishedDate: date("published_date"),
  // Optional external link to the published episode (Spotify/YouTube/Facebook).
  externalUrl: text("external_url"),
  ownerId: text("owner_id").references(() => user.id, {
    onDelete: "set null",
  }),
  // Null inherits projects.videoRequired; true/false is an explicit override.
  videoRequiredOverride: boolean("video_required_override"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** Per-project defaults for the fixed podcast production stages. */
export const podcastStageSettings = pgTable(
  "podcast_stage_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    stage: podcastStage("stage").notNull(),
    defaultAssigneeId: text("default_assignee_id").references(() => user.id, {
      onDelete: "set null",
    }),
    daysBeforePublication: integer("days_before_publication")
      .notNull()
      .default(0),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("podcast_stage_settings_project_stage_unique").on(
      t.projectId,
      t.stage
    ),
  ]
);

/** Live, per-project phase instances (materialized from a phase template). */
export const phases = pgTable("phases", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  orderIndex: integer("order_index").notNull().default(0),
  color: text("color"),
  // The coordinator role for this stage + how long it takes (drives the
  // due-date cascade as chapters advance). Null for non-pipeline phases.
  projectRoleId: uuid("project_role_id").references(() => projectRoles.id, {
    onDelete: "set null",
  }),
  durationDays: integer("duration_days"),
  startDate: date("start_date"),
  dueDate: date("due_date"),
  // Provenance (no FK so templates can be edited/removed independently).
  sourcePhaseTemplateId: uuid("source_phase_template_id"),
});
