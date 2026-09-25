import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { projects } from "./projects";

/**
 * Low-volume page notes with replies, scoped to a project surface such as
 * Budget or Rights. Separate from realtime Chat and from project status updates.
 */
export const projectSurfaceNotes = pgTable(
  "project_surface_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    surface: text("surface").notNull(),
    parentId: uuid("parent_id"),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("project_surface_notes_project_idx").on(
      t.projectId,
      t.surface,
      t.parentId,
      t.createdAt
    ),
  ]
);
