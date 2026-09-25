import {
  bigint,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { attachTarget, filePurpose, fileStatus } from "./enums";

/** File metadata. The bytes live in R2; the DB only holds this record. */
export const files = pgTable("files", {
  id: uuid("id").primaryKey().defaultRandom(),
  r2Key: text("r2_key").notNull().unique(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
  status: fileStatus("status").notNull().default("pending"),
  purpose: filePurpose("purpose")
    .notNull()
    .default("workspace_attachment"),
  uploadedBy: text("uploaded_by").references(() => user.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * One polymorphic join attaching files to many target types. No FK on target_id
 * (resolved by target_type in app code); a file can attach to multiple targets.
 */
export const fileAttachments = pgTable(
  "file_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    targetType: attachTarget("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    // Optional role/slot within a target (e.g. "mou" vs "license" on a rights record).
    label: text("label"),
    // Context for this specific attachment. A file reused elsewhere can have a
    // different note in each project, agreement, quote, or payment surface.
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("file_attachments_target_idx").on(t.targetType, t.targetId)]
);
