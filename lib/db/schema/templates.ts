import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { projectRoles } from "./app";

/**
 * Reusable plan templates: a named pipeline of phases, each with task templates.
 * Seeded in code (Book / Article / Article+AV). Materialized into a project's
 * real phases + tasks at creation time (see lib/projects/materialize.ts).
 */
export const planTemplates = pgTable("plan_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").unique(), // stable key for seeded templates; null for user-made
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: text("created_by").references(() => user.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const phaseTemplates = pgTable("phase_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  planTemplateId: uuid("plan_template_id")
    .notNull()
    .references(() => planTemplates.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  orderIndex: integer("order_index").notNull().default(0),
  defaultDurationDays: integer("default_duration_days"),
  color: text("color"),
});

export const taskTemplates = pgTable("task_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  phaseTemplateId: uuid("phase_template_id")
    .notNull()
    .references(() => phaseTemplates.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  orderIndex: integer("order_index").notNull().default(0),
  defaultProjectRoleId: uuid("default_project_role_id").references(
    () => projectRoles.id,
    { onDelete: "set null" }
  ),
  defaultOffsetDays: integer("default_offset_days"),
  // THE fan-out flag: if true, one task per chapter/unit; else one project-wide.
  isPerUnit: boolean("is_per_unit").notNull().default(false),
});
