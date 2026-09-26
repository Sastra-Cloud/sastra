import "server-only";

import { and, count, eq, gt, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  aiUsageSettings,
  hostedEntitlements,
  hostedManagementEvents,
  invitations,
  user,
} from "@/lib/db/schema";

import { creditsToUsd } from "./credits";
import { isNewerEntitlement } from "./entitlement-order";
import { hostedAccountUrl, hostedInstanceId, isHostedInstance } from "./mode";
import { checkSeatAvailable, type SeatCheck, type SeatUsage } from "./seats";

const ENTITLEMENT_ID = "workspace";

export type Entitlement = typeof hostedEntitlements.$inferSelect;

/** The current entitlement, or null when self-hosted or not yet provisioned. */
export async function getEntitlement(): Promise<Entitlement | null> {
  if (!isHostedInstance()) return null;
  const [row] = await db
    .select()
    .from(hostedEntitlements)
    .where(eq(hostedEntitlements.id, ENTITLEMENT_ID))
    .limit(1);
  return row ?? null;
}

/** Active people plus pending, unexpired invitations, against the plan's limit. */
export async function seatUsage(): Promise<SeatUsage> {
  const [[humans], [pending], entitlement] = await Promise.all([
    db
      .select({ value: count() })
      .from(user)
      .where(and(eq(user.isActive, true), eq(user.isBot, false))),
    db
      .select({ value: count() })
      .from(invitations)
      .where(and(isNull(invitations.acceptedAt), gt(invitations.expiresAt, new Date()))),
    getEntitlement(),
  ]);
  return {
    activeHumans: humans?.value ?? 0,
    pendingInvites: pending?.value ?? 0,
    limit: entitlement?.seatLimit ?? null,
  };
}

/**
 * Whether one more seat may be taken. `already` is how many of the requested
 * seats are already counted (a pending invite being replaced, an invite being
 * turned into an account).
 */
export async function assertSeatAvailable(already = 0): Promise<SeatCheck> {
  if (!isHostedInstance()) return { ok: true };
  return checkSeatAvailable(await seatUsage(), hostedAccountUrl(), already);
}

/**
 * Remember a management event id. Returns false when it was seen before, so
 * the caller can ignore a replayed request.
 */
export async function recordManagementEvent(eventId: string, kind: string): Promise<boolean> {
  const inserted = await db
    .insert(hostedManagementEvents)
    .values({ eventId, kind })
    .onConflictDoNothing()
    .returning({ eventId: hostedManagementEvents.eventId });
  return inserted.length > 0;
}

export type EntitlementEvent = {
  eventId: string;
  /** ISO time the change took effect at the control plane. */
  occurredAt: string;
  instanceId: string;
  seatLimit: number | null;
  /** File space in bytes; null or absent = unlimited. */
  storageLimitBytes?: number | null;
  aiMonthlyCredits: number;
  aiPackCredits: number;
  billingState: Entitlement["billingState"];
};

export type ApplyResult =
  | { applied: true }
  | { applied: false; reason: "replayed" | "older" | "wrong-instance" };

/**
 * Apply an entitlement change idempotently: replayed event ids are ignored,
 * and an event older than the current entitlement is recorded but not applied
 * (deliveries can arrive out of order). The AI budget cap follows the credits.
 */
export async function applyEntitlementEvent(event: EntitlementEvent): Promise<ApplyResult> {
  if (event.instanceId !== hostedInstanceId()) return { applied: false, reason: "wrong-instance" };
  const fresh = await recordManagementEvent(event.eventId, "entitlement");
  if (!fresh) return { applied: false, reason: "replayed" };

  const occurredAt = new Date(event.occurredAt);
  const current = await getEntitlement();
  if (!isNewerEntitlement(current?.effectiveAt ?? null, occurredAt)) {
    return { applied: false, reason: "older" };
  }

  const values = {
    instanceId: event.instanceId,
    seatLimit: event.seatLimit,
    storageLimitBytes: event.storageLimitBytes ?? null,
    aiMonthlyCredits: event.aiMonthlyCredits,
    aiPackCredits: event.aiPackCredits,
    billingState: event.billingState,
    effectiveAt: occurredAt,
    lastEventId: event.eventId,
    lastEventAt: new Date(),
    updatedAt: new Date(),
  };
  await db.transaction(async (tx) => {
    await tx
      .insert(hostedEntitlements)
      .values({ id: ENTITLEMENT_ID, ...values })
      .onConflictDoUpdate({ target: hostedEntitlements.id, set: values });
    // The workspace AI cap is derived from credits in hosted mode; the
    // provider-side key limit is the hard stop, this keeps the app's own
    // budget check and warnings in step with it.
    const budget = creditsToUsd(event.aiMonthlyCredits + event.aiPackCredits);
    await tx
      .insert(aiUsageSettings)
      .values({ id: "workspace", workspaceAiMonthlyBudgetUsd: budget })
      .onConflictDoUpdate({
        target: aiUsageSettings.id,
        set: { workspaceAiMonthlyBudgetUsd: budget, updatedAt: new Date() },
      });
  });
  return { applied: true };
}
