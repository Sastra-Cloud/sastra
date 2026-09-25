import { NextResponse } from "next/server";
import { z } from "zod";

import { applyEntitlementEvent } from "@/lib/hosted/entitlements";
import { authorizeManagementRequest } from "@/lib/hosted/management-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const eventSchema = z.object({
  occurredAt: z.string().datetime({ offset: true }),
  instanceId: z.string().min(1),
  seatLimit: z.number().int().positive().nullable(),
  aiMonthlyCredits: z.number().int().min(0),
  aiPackCredits: z.number().int().min(0),
  billingState: z.enum(["trialing", "active", "past_due", "suspended", "cancelled"]),
});

/** Apply a newer entitlement from the control plane; replays and stale events are ignored. */
export async function POST(request: Request) {
  const auth = await authorizeManagementRequest(request);
  if (!auth.ok) return auth.response;

  let parsed: z.infer<typeof eventSchema>;
  try {
    parsed = eventSchema.parse(JSON.parse(auth.body));
  } catch {
    return NextResponse.json({ error: "Invalid entitlement event." }, { status: 400 });
  }

  const result = await applyEntitlementEvent({ eventId: auth.eventId, ...parsed });
  if (!result.applied && result.reason === "wrong-instance") {
    return NextResponse.json({ error: "Event is for another instance." }, { status: 409 });
  }
  return NextResponse.json({ ok: true, ...result });
}
