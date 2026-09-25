import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { projects } from "./projects";

/**
 * Personal, resumable drafts for human-reviewed outbound email composers.
 *
 * Invoice evidence selections are snapshotted here and checked against current
 * reviewed delivery evidence before sending.
 */
export const emailDrafts = pgTable(
  "email_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    kind: text("kind").notNull(),
    contextId: uuid("context_id").notNull(),
    toAddresses: jsonb("to_addresses").$type<string[]>().notNull().default([]),
    ccAddresses: jsonb("cc_addresses").$type<string[]>().notNull().default([]),
    subject: text("subject").notNull().default(""),
    body: text("body").notNull().default(""),
    evidence: jsonb("evidence").$type<Array<{ requirement: string; url: string; fileId?: string }>>(),
    baselineSubject: text("baseline_subject"),
    baselineBody: text("baseline_body"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("email_drafts_user_kind_context_uq").on(
      table.userId,
      table.kind,
      table.contextId
    ),
    index("email_drafts_project_user_idx").on(table.projectId, table.userId),
  ]
);
