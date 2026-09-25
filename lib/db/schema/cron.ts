import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Last-run record per scheduled job, so a silently-failing cron is visible.
 * `runningSince` is the tick runner's lease: set while a job runs so a second
 * tick skips it, and treated as stale after 30 minutes.
 */
export const cronRuns = pgTable("cron_runs", {
  name: text("name").primaryKey(),
  lastRunAt: timestamp("last_run_at").defaultNow().notNull(),
  ok: boolean("ok").notNull().default(true),
  note: text("note"),
  runningSince: timestamp("running_since"),
});
