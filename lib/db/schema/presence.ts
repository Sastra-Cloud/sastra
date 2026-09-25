import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

/**
 * One row per user tracking live presence. `lastActiveAt` advances on visible
 * heartbeats; `lastHiddenAt` records when the tab was backgrounded;
 * `manualStatus` is an explicit override ("auto" | "away" | "offline"). Status is
 * derived at read time (lib/presence/status.ts) — no background job needed.
 */
export const userPresence = pgTable("user_presence", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  lastActiveAt: timestamp("last_active_at").defaultNow().notNull(),
  lastHiddenAt: timestamp("last_hidden_at"),
  manualStatus: text("manual_status").notNull().default("auto"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
