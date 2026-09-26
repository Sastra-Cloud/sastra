import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

/** A reviewed, local extraction example. No historical rows are enrolled. */
export const documentLearningCases = pgTable("document_learning_cases", {
  id: uuid("id").primaryKey().defaultRandom(),
  workflow: text("workflow").notNull(),
  source: text("source").notNull(),
  sourceRef: text("source_ref").notNull(),
  sourceName: text("source_name"),
  sourceText: text("source_text"),
  prediction: jsonb("prediction").$type<Record<string, unknown> | null>(),
  corrected: jsonb("corrected").$type<Record<string, unknown>>().notNull(),
  enabled: boolean("enabled").notNull().default(true),
  cloudSubmittedAt: timestamp("cloud_submitted_at"),
  submittedRule: jsonb("submitted_rule").$type<import("@/lib/document-learning/shared-rules").SharedDocumentRule>(),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("document_learning_cases_source_uq").on(t.source, t.sourceRef),
  index("document_learning_cases_workflow_idx").on(t.workflow, t.enabled),
]);

/** Last verified Cloud library; a failed sync never clears this row. */
export const sharedDocumentLibrary = pgTable("shared_document_library", {
  id: text("id").primaryKey().default("library"),
  version: integer("version").notNull().default(0),
  lessons: jsonb("lessons").$type<import("@/lib/document-learning/shared-rules").PublishedDocumentRule[]>().notNull().default([]),
  syncedAt: timestamp("synced_at"),
  attemptedAt: timestamp("attempted_at"),
});
