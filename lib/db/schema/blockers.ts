import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { projects } from "./projects";
import { blockerType, severity } from "./enums";

/**
 * Cached blockers, recomputed by the blockers engine from rights/budget/overdue
 * sources. The engine also writes projects.health_status for the portfolio RAG.
 */
export const blockers = pgTable(
  "blockers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    type: blockerType("type").notNull(),
    severity: severity("severity").notNull().default("warning"),
    title: text("title").notNull(),
    sourceType: text("source_type"),
    sourceId: uuid("source_id"),
    isResolved: boolean("is_resolved").notNull().default(false),
    detectedAt: timestamp("detected_at").defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at"),
  },
  (t) => [index("blockers_project_idx").on(t.projectId)]
);
