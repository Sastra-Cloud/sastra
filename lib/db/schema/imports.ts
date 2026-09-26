import { boolean, jsonb, pgTable, text, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { files } from "./files";
import { projects } from "./projects";
import { mouPayments } from "./budget";
import { importStatus } from "./enums";
import type { ImportExtraction } from "@/lib/imports/types";

/**
 * One uploaded legal document (MOU / license / grant) on its way to becoming
 * projects. A single document may yield several projects (some agreements bundle
 * many works), so `committedProjectIds` is an array. Mirrors `aiPlanDrafts`.
 *
 * `extraction` is the immutable raw model output; `reviewed` is the manager's
 * edited copy (starts equal to `extraction`) and is what actually gets
 * committed. A non-empty `committedProjectIds` is the idempotency guard.
 *
 * When `targetProjectId` is set the import runs in "update mode": instead of
 * creating projects, committing merges the extraction into that existing
 * project's budget/rights/details. Null = create mode.
 */
export const documentImports = pgTable("document_imports", {
  id: uuid("id").primaryKey().defaultRandom(),
  fileId: uuid("file_id").references(() => files.id, { onDelete: "set null" }),
  targetProjectId: uuid("target_project_id").references(() => projects.id, {
    onDelete: "cascade",
  }),
  /** Optional row-level hint when an invoice upload starts from a payment card. */
  targetMouPaymentId: uuid("target_mou_payment_id").references(
    () => mouPayments.id,
    { onDelete: "set null" }
  ),
  fundingSourceKey: text("funding_source_key"),
  sourceThreadId: uuid("source_thread_id"),
  sourceMessageId: uuid("source_message_id"),
  status: importStatus("status").notNull().default("uploaded"),
  extraction: jsonb("extraction").$type<ImportExtraction>(),
  sourceText: text("source_text"),
  learnFromReview: boolean("learn_from_review").notNull().default(true),
  reviewed: jsonb("reviewed").$type<ImportExtraction>(),
  committedProjectIds: uuid("committed_project_ids").array(),
  model: text("model"),
  error: text("error"),
  errorKind: text("error_kind"),
  createdBy: text("created_by").references(() => user.id, {
    onDelete: "set null",
  }),
  committedAt: timestamp("committed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("document_imports_funding_source_uq").on(t.fundingSourceKey)]);
