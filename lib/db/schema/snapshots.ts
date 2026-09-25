import {
  date,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { projects } from "./projects";

/** One row per project per day — the history that powers trend lines. */
export const projectSnapshots = pgTable(
  "project_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    snapDate: date("snap_date").notNull(),
    healthStatus: text("health_status"),
    totalTasks: integer("total_tasks").notNull().default(0),
    doneTasks: integer("done_tasks").notNull().default(0),
    blockerCount: integer("blocker_count").notNull().default(0),
    criticalBlockerCount: integer("critical_blocker_count").notNull().default(0),
    budgetNeeded: numeric("budget_needed", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    budgetSecured: numeric("budget_secured", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("project_snapshots_uq").on(t.projectId, t.snapDate)]
);
