import {
  boolean,
  date,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { projects } from "./projects";
import { priority } from "./enums";

/**
 * A rule that materializes a task each period. The daily cron generator
 * (`lib/tasks/recurring.ts`) creates the next upcoming occurrence eagerly, so a
 * task always exists ahead of its due date. `frequency` ∈ weekly|monthly|
 * quarterly|annual; occurrences are computed from `anchorDate` (no drift).
 */
export const recurringTasks = pgTable("recurring_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdBy: text("created_by").references(() => user.id, {
    onDelete: "set null",
  }),
  isActive: boolean("is_active").notNull().default(true),
  projectId: uuid("project_id").references(() => projects.id, {
    onDelete: "cascade",
  }),
  title: text("title").notNull(),
  description: text("description"),
  assigneeId: text("assignee_id").references(() => user.id, {
    onDelete: "set null",
  }),
  priority: priority("priority").notNull().default("medium"),
  isMilestone: boolean("is_milestone").notNull().default(false),
  estimateHours: numeric("estimate_hours", { precision: 6, scale: 2 }),
  frequency: text("frequency").notNull(),
  anchorDate: date("anchor_date").notNull(),
  endDate: date("end_date"),
  lastGeneratedDate: date("last_generated_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
