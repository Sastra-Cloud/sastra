import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { user } from "./auth";
import { printPayments, printRuns } from "./print";
import { phases, projects, units } from "./projects";
import { podcastStage, priority, taskStatus } from "./enums";

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Nullable: a task can be a standalone one-off not tied to any project.
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    printRunId: uuid("print_run_id").references(() => printRuns.id, {
      onDelete: "set null",
    }),
    // Set on the one actionable task generated for a printer payment. Keeping
    // the provenance on the task avoids a schema import cycle and makes task
    // creation idempotent across accepted invoices and direct uploads.
    printPaymentId: uuid("print_payment_id").references(() => printPayments.id, {
      onDelete: "cascade",
    }),
    phaseId: uuid("phase_id").references(() => phases.id, {
      onDelete: "set null",
    }),
    unitId: uuid("unit_id").references(() => units.id, { onDelete: "set null" }),
    // Set only for the standard task representing one podcast production stage.
    podcastStage: podcastStage("podcast_stage"),
    title: text("title").notNull(),
    description: text("description"),
    status: taskStatus("status").notNull().default("todo"),
    priority: priority("priority").notNull().default("medium"),
    assignedTo: text("assigned_to").references(() => user.id, {
      onDelete: "set null",
    }),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    dueDate: date("due_date"),
    // Protects dates a person deliberately changed from backward rescheduling.
    dueDateIsManual: boolean("due_date_is_manual").notNull().default(false),
    orderIndex: integer("order_index").notNull().default(0),
    // PM-controlled importance order within an assignee's queue ("do this first").
    rank: doublePrecision("rank").notNull().default(0),
    isMilestone: boolean("is_milestone").notNull().default(false),
    estimateHours: numeric("estimate_hours", { precision: 6, scale: 2 }),
    // Google Drive: this task's default working sub-folder (usually inside the
    // project's main folder). Uploads from the task land here by default. This is
    // distinct from taskDriveFiles (reference attachments). Null until set.
    driveFolderId: text("drive_folder_id"),
    driveFolderName: text("drive_folder_name"),
    driveFolderUrl: text("drive_folder_url"),
    sourceTaskTemplateId: uuid("source_task_template_id"),
    // Provenance for tasks materialized by a recurring rule (dedupe key with dueDate).
    sourceRecurringTaskId: uuid("source_recurring_task_id"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("tasks_print_run_idx").on(t.printRunId),
    uniqueIndex("tasks_print_payment_unique").on(t.printPaymentId),
    uniqueIndex("tasks_unit_podcast_stage_unique")
      .on(t.unitId, t.podcastStage)
      .where(sql`${t.podcastStage} is not null`),
  ]
);

export const taskDependencies = pgTable(
  "task_dependencies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    dependsOnTaskId: uuid("depends_on_task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("task_dependencies_unique").on(t.taskId, t.dependsOnTaskId),
  ]
);

export const taskComments = pgTable("task_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Google Drive files linked to a task (picked via the Drive Picker). The bytes
 * stay in Drive; we only keep the reference so we can list + deep-link them.
 */
export const taskDriveFiles = pgTable(
  "task_drive_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    driveFileId: text("drive_file_id").notNull(),
    name: text("name").notNull(),
    mimeType: text("mime_type"),
    iconUrl: text("icon_url"),
    url: text("url").notNull(),
    addedBy: text("added_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("task_drive_files_unique").on(t.taskId, t.driveFileId)]
);
