import { describe, expect, it } from "vitest";

import {
  runCronTick,
  type CronJob,
  type CronJobContext,
  type CronRunState,
  type TickStore,
} from "./tick";

function memoryStore(initial: Record<string, Partial<CronRunState>> = {}) {
  const runs = new Map<string, CronRunState>();
  for (const [name, state] of Object.entries(initial)) {
    runs.set(name, {
      lastRunAt: state.lastRunAt ?? new Date(0),
      ok: state.ok ?? true,
      note: state.note ?? null,
      runningSince: state.runningSince ?? null,
    });
  }
  const acquired: string[] = [];
  const store: TickStore = {
    async loadRuns() {
      return new Map(runs);
    },
    async acquire(name, now) {
      const state = runs.get(name);
      if (state?.runningSince && now.getTime() - state.runningSince.getTime() < 30 * 60_000) {
        return false;
      }
      runs.set(name, {
        lastRunAt: state?.lastRunAt ?? now,
        ok: state?.ok ?? true,
        note: state?.note ?? null,
        runningSince: now,
      });
      acquired.push(name);
      return true;
    },
    async release(name, outcome, finishedAt) {
      runs.set(name, { lastRunAt: finishedAt, ok: outcome.ok, note: outcome.note, runningSince: null });
    },
  };
  return { store, runs, acquired };
}

const identity = (base: CronJobContext) => base;
const now = new Date("2026-09-24T03:00:00.000Z");

function job(
  name: string,
  dueAt: Date | null,
  run: CronJob["run"] = async () => ({ ok: true, note: "done", result: { count: 1 } })
): CronJob {
  return { name, nextDue: async () => dueAt, run };
}

describe("runCronTick", () => {
  it("runs due jobs, skips future ones, and reports the earliest next due time", async () => {
    const later = new Date(now.getTime() + 10 * 60_000);
    const { store } = memoryStore();
    const report = await runCronTick(
      [job("due-now", now), job("later", later), job("never", null)],
      store,
      identity,
      { now }
    );
    expect(report.ok).toBe(true);
    expect(report.ran.map((r) => r.name)).toEqual(["due-now"]);
    expect(report.ran[0]?.result).toEqual({ count: 1 });
    expect(report.skipped).toEqual([
      { name: "later", reason: "not-due", dueAt: later.toISOString() },
      { name: "never", reason: "not-due", dueAt: null },
    ]);
    // "due-now" still reports `now` as its next due (constant stub), which is
    // the earliest of the remaining jobs.
    expect(report.nextDueAt).toBe(now.toISOString());
  });

  it("records failures without stopping the other jobs", async () => {
    const { store, runs } = memoryStore();
    const failing = job("broken", now, async () => {
      throw new Error("boom   happened");
    });
    const report = await runCronTick([failing, job("fine", now)], store, identity, { now });
    expect(report.ok).toBe(false);
    expect(report.ran).toHaveLength(2);
    expect(report.ran[0]).toMatchObject({ name: "broken", ok: false, note: "boom happened" });
    expect(runs.get("broken")).toMatchObject({ ok: false, note: "boom happened", runningSince: null });
    expect(runs.get("fine")).toMatchObject({ ok: true, runningSince: null });
  });

  it("skips a job whose lease is still fresh and takes over a stale one", async () => {
    const fresh = new Date(now.getTime() - 5 * 60_000);
    const stale = new Date(now.getTime() - 45 * 60_000);
    const { store, acquired } = memoryStore({
      busy: { runningSince: fresh },
      abandoned: { runningSince: stale },
    });
    const report = await runCronTick([job("busy", now), job("abandoned", now)], store, identity, {
      now,
    });
    expect(report.skipped).toEqual([{ name: "busy", reason: "running", dueAt: now.toISOString() }]);
    expect(acquired).toEqual(["abandoned"]);
    expect(report.ran.map((r) => r.name)).toEqual(["abandoned"]);
    // A job another tick is running is left out of the next-due estimate.
    expect(report.nextDueAt).toBe(now.toISOString());
  });

  it("forces the selected job through the legacy path and leaves the rest alone", async () => {
    const later = new Date(now.getTime() + 60 * 60_000);
    const { store } = memoryStore();
    const report = await runCronTick([job("a", later), job("b", now)], store, identity, {
      now,
      only: ["a"],
      force: true,
    });
    expect(report.ran.map((r) => r.name)).toEqual(["a"]);
    expect(report.skipped).toEqual([{ name: "b", reason: "not-selected", dueAt: null }]);
    expect(report.nextDueAt).toBe(now.toISOString());
  });

  it("passes the last completed run to the job context", async () => {
    const lastRunAt = new Date(now.getTime() - 60_000);
    const { store } = memoryStore({ ticker: { lastRunAt } });
    const seen: Array<Date | null> = [];
    const j: CronJob = {
      name: "ticker",
      nextDue: async (ctx) => {
        seen.push(ctx.lastRunAt);
        return now;
      },
      run: async () => ({ ok: true, note: "", result: {} }),
    };
    await runCronTick([j], store, identity, { now });
    expect(seen[0]).toEqual(lastRunAt);
    // After running, the context carries the new completion time.
    expect(seen[1]!.getTime()).toBeGreaterThanOrEqual(now.getTime());
  });
});
