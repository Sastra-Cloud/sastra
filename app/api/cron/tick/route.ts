import { NextResponse } from "next/server";

import { isCronRequestAuthorized } from "@/lib/cron/auth";
import { isCronJobName } from "@/lib/cron/jobs";
import { runScheduledTick } from "@/lib/cron/scheduled";

// Jobs use IMAP, the AWS SDK, and pdf parsing → Node runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Run every scheduled job that is due and report when the next one is.
 *
 * Self-hosted schedulers call this once a minute with
 * `Authorization: Bearer <CRON_SECRET>`. Sastra Cloud calls it at `nextDueAt`
 * so an idle instance can sleep between jobs.
 *
 * Optional JSON body: `{ "jobs": ["standup"], "force": true }` to run specific
 * jobs regardless of schedule (support and debugging).
 */
export async function POST(request: Request) {
  if (!isCronRequestAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let only: string[] | undefined;
  let force = false;
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const body = (await request.json()) as { jobs?: unknown; force?: unknown };
      if (Array.isArray(body.jobs)) {
        only = body.jobs.filter((j): j is string => typeof j === "string");
        const unknown = only.filter((j) => !isCronJobName(j));
        if (unknown.length) {
          return NextResponse.json(
            { error: `Unknown jobs: ${unknown.join(", ")}` },
            { status: 400 }
          );
        }
      }
      force = body.force === true;
    } catch {
      return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
    }
  }

  const report = await runScheduledTick({ only, force });
  return NextResponse.json(report, { status: report.ok ? 200 : 500 });
}
