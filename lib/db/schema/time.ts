import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { tasks } from "./tasks";

/**
 * One work session on a task. A row with `endedAt = null` is the user's single
 * running timer — enforced by the partial unique index below. `durationSeconds`
 * is filled on stop (and for manual entries). `source`: timer | manual | auto.
 */
export const timeEntries = pgTable(
  "time_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at").notNull(),
    endedAt: timestamp("ended_at"),
    durationSeconds: integer("duration_seconds"),
    source: text("source").notNull().default("timer"),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    // At most one running (unstopped) timer per user.
    uniqueIndex("time_entries_one_running_per_user")
      .on(t.userId)
      .where(sql`${t.endedAt} is null`),
    index("time_entries_task_idx").on(t.taskId),
    index("time_entries_user_started_idx").on(t.userId, t.startedAt),
  ]
);
