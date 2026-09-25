import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { printRuns } from "@/lib/db/schema";

export const PRINT_RUN_STATUS_ORDER = [
  "planning",
  "seeking_funding",
  "quote_requested",
  "quote_received",
  "proofing",
  "awaiting_payment",
  "printing",
  "shipping",
  "completed",
] as const;

/** Move a print run forward without downgrading or reopening a terminal run. */
export async function advancePrintRunStatus(
  runId: string,
  target: (typeof PRINT_RUN_STATUS_ORDER)[number]
) {
  const [run] = await db
    .select({ status: printRuns.status })
    .from(printRuns)
    .where(eq(printRuns.id, runId))
    .limit(1);
  if (!run || run.status === "cancelled") return false;

  const current = PRINT_RUN_STATUS_ORDER.indexOf(
    run.status as (typeof PRINT_RUN_STATUS_ORDER)[number]
  );
  const next = PRINT_RUN_STATUS_ORDER.indexOf(target);
  if (next < 0 || current >= next) return false;

  await db
    .update(printRuns)
    .set({ status: target, updatedAt: new Date() })
    .where(and(eq(printRuns.id, runId), eq(printRuns.status, run.status)));
  return true;
}
