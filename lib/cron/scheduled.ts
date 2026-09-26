import "server-only";

import { eq, isNull, lt, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { cronRuns } from "@/lib/db/schema";
import { getWorkspaceSettings } from "@/lib/workspace/queries";

import { SCHEDULED_JOBS, type ScheduledJobContext } from "./jobs";
import { LEASE_STALE_MS } from "./schedule";
import { runCronTick, type CronRunState, type TickOptions, type TickReport, type TickStore } from "./tick";
import { noteScheduledTickFinished, noteScheduledTickStarted } from "@/lib/hosted/tick-request";

/** Drizzle-backed lease store over `cron_runs`. */
const store: TickStore = {
  async loadRuns() {
    const rows = await db.select().from(cronRuns);
    const map = new Map<string, CronRunState>();
    for (const row of rows) {
      map.set(row.name, {
        lastRunAt: row.lastRunAt,
        ok: row.ok,
        note: row.note,
        runningSince: row.runningSince,
      });
    }
    return map;
  },
  async acquire(name, now) {
    const staleBefore = new Date(now.getTime() - LEASE_STALE_MS);
    const taken = await db
      .insert(cronRuns)
      .values({ name, lastRunAt: now, ok: true, note: "running", runningSince: now })
      .onConflictDoUpdate({
        target: cronRuns.name,
        set: { runningSince: now },
        setWhere: or(isNull(cronRuns.runningSince), lt(cronRuns.runningSince, staleBefore)),
      })
      .returning({ name: cronRuns.name });
    return taken.length > 0;
  },
  async release(name, outcome, finishedAt) {
    await db
      .update(cronRuns)
      .set({ lastRunAt: finishedAt, ok: outcome.ok, note: outcome.note || null, runningSince: null })
      .where(eq(cronRuns.name, name));
  },
};

/**
 * Run the scheduled jobs that are due. Self-hosted schedulers call this every
 * minute; Sastra Cloud calls it at `nextDueAt`.
 */
export async function runScheduledTick(options: TickOptions = {}): Promise<TickReport> {
  noteScheduledTickStarted();
  try {
    const workspace = await getWorkspaceSettings();
    return await runCronTick<ScheduledJobContext>(
      SCHEDULED_JOBS,
      store,
      (base) => ({ ...base, workspace }),
      options
    );
  } finally {
    noteScheduledTickFinished();
  }
}
