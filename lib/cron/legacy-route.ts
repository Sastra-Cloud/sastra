import "server-only";

import { NextResponse } from "next/server";

import { isCronRequestAuthorized } from "./auth";
import type { CronJobName } from "./jobs";
import { runScheduledTick } from "./scheduled";

/**
 * The per-job cron routes predate `/api/cron/tick`. They stay as aliases so
 * existing Coolify scheduled tasks keep working: each forces its one job and
 * returns that job's counters, as before.
 */
export function legacyCronRoute(name: CronJobName) {
  return async function handle(request: Request) {
    if (!isCronRequestAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const report = await runScheduledTick({ only: [name], force: true });
    const ran = report.ran.find((r) => r.name === name);
    if (!ran) {
      return NextResponse.json(
        { ok: false, error: "This job is already running.", nextDueAt: report.nextDueAt },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { ok: ran.ok, ...ran.result, note: ran.note, nextDueAt: report.nextDueAt },
      { status: ran.ok ? 200 : 500 }
    );
  };
}
