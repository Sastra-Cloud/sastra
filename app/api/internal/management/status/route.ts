import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";

import pkg from "@/package.json";
import { db } from "@/lib/db";
import { cronRuns } from "@/lib/db/schema";
import { getWorkspaceAiBudgetStatus } from "@/lib/ai/usage";
import { usdToCredits } from "@/lib/hosted/credits";
import { getEntitlement, seatUsage } from "@/lib/hosted/entitlements";
import { authorizeManagementRequest } from "@/lib/hosted/management-guard";
import { hostedInstanceId } from "@/lib/hosted/mode";
import { getWorkspaceSettings } from "@/lib/workspace/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Instance status for the control plane: counts and states only, never names,
 * email addresses, or customer content. Called on demand, not polled.
 */
export async function GET(request: Request) {
  const auth = await authorizeManagementRequest(request);
  if (!auth.ok) return auth.response;

  const [workspace, usage, entitlement, [lastCron], aiBudget] = await Promise.all([
    getWorkspaceSettings(),
    seatUsage(),
    getEntitlement(),
    db.select().from(cronRuns).orderBy(desc(cronRuns.lastRunAt)).limit(1),
    getWorkspaceAiBudgetStatus(),
  ]);

  return NextResponse.json(
    {
      instanceId: hostedInstanceId(),
      version: process.env.SASTRA_VERSION?.trim() || pkg.version,
      revision: process.env.SASTRA_REVISION?.trim() || null,
      setupComplete: Boolean(workspace.orgName),
      activeHumans: usage.activeHumans,
      pendingInvites: usage.pendingInvites,
      seatLimit: usage.limit,
      billingState: entitlement?.billingState ?? null,
      /** Credits consumed this month, for the control plane's ledger. */
      aiCreditsUsedThisMonth: usdToCredits(aiBudget.spentUsd),
      entitlementEffectiveAt: entitlement?.effectiveAt.toISOString() ?? null,
      lastCron: lastCron
        ? { name: lastCron.name, at: lastCron.lastRunAt.toISOString(), ok: lastCron.ok }
        : null,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
