/**
 * The cron tick runs whichever scheduled jobs are due and reports when the
 * next one will be. The runner is pure over an injected job list and store so
 * it can be tested without a database; `runScheduledTick` binds it to Drizzle.
 */
import { earliest, LEASE_STALE_MS } from "./schedule";

export type CronRunState = {
  lastRunAt: Date;
  ok: boolean;
  note: string | null;
  runningSince: Date | null;
};

export type CronJobContext = {
  now: Date;
  /** Last completed run, or null when the job has never run. */
  lastRunAt: Date | null;
};

export type CronJobOutcome = {
  ok: boolean;
  /** Short human-readable summary stored in `cron_runs.note`. */
  note: string;
  /** Job-specific counters, returned to the caller. */
  result: Record<string, unknown>;
};

export type CronJob<Ctx extends CronJobContext = CronJobContext> = {
  name: string;
  /** When the job next has work. `null` means "nothing scheduled". */
  nextDue(ctx: Ctx): Promise<Date | null>;
  run(ctx: Ctx): Promise<CronJobOutcome>;
};

export type TickStore = {
  loadRuns(): Promise<Map<string, CronRunState>>;
  /** Take the job's lease; false when another tick holds a fresh lease. */
  acquire(name: string, now: Date): Promise<boolean>;
  /** Record the outcome and release the lease. */
  release(name: string, outcome: { ok: boolean; note: string }, finishedAt: Date): Promise<void>;
};

export type TickOptions = {
  /** Restrict to these job names (legacy per-job routes). */
  only?: string[];
  /** Run the selected jobs even when they are not due. */
  force?: boolean;
  now?: Date;
};

export type TickReport = {
  ok: boolean;
  now: string;
  ran: Array<{
    name: string;
    ok: boolean;
    note: string;
    durationMs: number;
    result: Record<string, unknown>;
  }>;
  skipped: Array<{ name: string; reason: "not-due" | "running" | "not-selected"; dueAt: string | null }>;
  /** Earliest time any job has work, or null when nothing is scheduled. */
  nextDueAt: string | null;
};

function leaseIsFresh(state: CronRunState | undefined, now: Date): boolean {
  return Boolean(
    state?.runningSince && now.getTime() - state.runningSince.getTime() < LEASE_STALE_MS
  );
}

export async function runCronTick<Ctx extends CronJobContext>(
  jobs: CronJob<Ctx>[],
  store: TickStore,
  makeContext: (base: CronJobContext) => Ctx,
  options: TickOptions = {}
): Promise<TickReport> {
  const now = options.now ?? new Date();
  const selected = new Set(options.only ?? jobs.map((j) => j.name));
  let runs = await store.loadRuns();
  const report: TickReport = {
    ok: true,
    now: now.toISOString(),
    ran: [],
    skipped: [],
    nextDueAt: null,
  };

  for (const job of jobs) {
    if (!selected.has(job.name)) {
      report.skipped.push({ name: job.name, reason: "not-selected", dueAt: null });
      continue;
    }
    const state = runs.get(job.name);
    const ctx = makeContext({ now, lastRunAt: state?.lastRunAt ?? null });
    if (!options.force) {
      const dueAt = await job.nextDue(ctx);
      if (!dueAt || dueAt.getTime() > now.getTime()) {
        report.skipped.push({
          name: job.name,
          reason: "not-due",
          dueAt: dueAt ? dueAt.toISOString() : null,
        });
        continue;
      }
    }
    if (leaseIsFresh(state, now) || !(await store.acquire(job.name, now))) {
      report.skipped.push({ name: job.name, reason: "running", dueAt: now.toISOString() });
      continue;
    }

    const startedAt = Date.now();
    let outcome: CronJobOutcome;
    try {
      outcome = await job.run(ctx);
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error))
        .replace(/\s+/g, " ")
        .slice(0, 500);
      outcome = { ok: false, note: message, result: { error: message } };
    }
    await store.release(job.name, { ok: outcome.ok, note: outcome.note }, new Date());
    report.ran.push({
      name: job.name,
      ok: outcome.ok,
      note: outcome.note,
      durationMs: Date.now() - startedAt,
      result: outcome.result,
    });
    if (!outcome.ok) report.ok = false;
  }

  // Reload so jobs that just ran report their next due time from the new run.
  runs = await store.loadRuns();
  const after = new Date();
  let next: Date | null = null;
  for (const job of jobs) {
    const state = runs.get(job.name);
    if (leaseIsFresh(state, after)) continue; // another tick will report it
    const ctx = makeContext({ now: after, lastRunAt: state?.lastRunAt ?? null });
    next = earliest(next, await job.nextDue(ctx));
  }
  report.nextDueAt = next ? next.toISOString() : null;
  return report;
}
