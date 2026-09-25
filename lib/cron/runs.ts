import "server-only";

import { db } from "@/lib/db";
import { cronRuns } from "@/lib/db/schema";
import { logger } from "@/lib/logger";

/** Record a cron job's last run (upsert by name). Best-effort. */
export async function recordCronRun(
  name: string,
  ok: boolean,
  note?: string
): Promise<void> {
  try {
    await db
      .insert(cronRuns)
      .values({ name, lastRunAt: new Date(), ok, note: note ?? null })
      .onConflictDoUpdate({
        target: cronRuns.name,
        set: { lastRunAt: new Date(), ok, note: note ?? null },
      });
  } catch (err) {
    logger.error("recordCronRun failed", err);
  }
}

export type CronRun = {
  name: string;
  lastRunAt: Date;
  ok: boolean;
  note: string | null;
};

export async function getCronRuns(): Promise<CronRun[]> {
  return db.select().from(cronRuns);
}
