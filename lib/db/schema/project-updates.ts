import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { projects } from "./projects";
import type { ProjectUpdateAnalysis } from "@/lib/projects/update-review-schema";

/**
 * Lightweight project status updates + their replies, in one self-referential
 * table. A row with `parentId = null` is a status update; a row with `parentId`
 * set is a reply to that update. Distinct from realtime Chat — this is the
 * low-volume "where does this project stand" surface. (parentId is a plain uuid
 * with no FK, matching chatMessages.replyToId; reply cleanup is handled in the
 * delete action.)
 */
export const projectUpdates = pgTable(
  "project_updates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    aiAnalysis: jsonb("ai_analysis").$type<ProjectUpdateAnalysis>(),
    aiAnalyzedAt: timestamp("ai_analyzed_at"),
    aiReviewedAt: timestamp("ai_reviewed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("project_updates_project_idx").on(t.projectId, t.parentId, t.createdAt),
    index("project_updates_ai_review_idx").on(
      t.parentId,
      t.aiAnalyzedAt,
      t.updatedAt
    ),
  ]
);
