import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { projects } from "./projects";

/** Lightweight audit trail of who changed what (tasks, budget, rights, …). */
export const activityLog = pgTable("activity_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
  projectId: uuid("project_id").references(() => projects.id, {
    onDelete: "cascade",
  }),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  action: text("action").notNull(),
  summary: text("summary").notNull(),
  data: jsonb("data"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
