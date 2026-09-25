import "server-only";

import { gt, ne, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { userPresence } from "@/lib/db/schema";
import {
  AWAY_WINDOW_MS,
  derivePresence,
  type ManualStatus,
  type PresenceStatus,
} from "./status";

/** Record a heartbeat. A visible beat advances activity; a hidden beat just
 *  stamps when the tab was backgrounded. Manual overrides are left untouched. */
export async function recordHeartbeat(userId: string, visible: boolean) {
  const now = new Date();
  await db
    .insert(userPresence)
    .values({
      userId,
      lastActiveAt: now,
      lastHiddenAt: visible ? null : now,
      manualStatus: "auto",
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userPresence.userId,
      set: visible
        ? { lastActiveAt: now, updatedAt: now }
        : { lastHiddenAt: now, updatedAt: now },
    });
}

/** Explicit user override of their own status. Selecting "auto" (Active) also
 *  refreshes activity so they immediately read as online. */
export async function setManualPresence(userId: string, manual: ManualStatus) {
  const now = new Date();
  await db
    .insert(userPresence)
    .values({ userId, lastActiveAt: now, manualStatus: manual, updatedAt: now })
    .onConflictDoUpdate({
      target: userPresence.userId,
      set:
        manual === "auto"
          ? {
              manualStatus: "auto",
              lastActiveAt: now,
              lastHiddenAt: null,
              updatedAt: now,
            }
          : { manualStatus: manual, updatedAt: now },
    });
}

/** Map of userId → status for everyone currently online or away (offline omitted). */
export async function listActivePresence(
  now = new Date()
): Promise<Record<string, PresenceStatus>> {
  const cutoff = new Date(now.getTime() - AWAY_WINDOW_MS);
  const rows = await db
    .select()
    .from(userPresence)
    .where(
      or(gt(userPresence.lastActiveAt, cutoff), ne(userPresence.manualStatus, "auto"))
    );

  const out: Record<string, PresenceStatus> = {};
  for (const r of rows) {
    const status = derivePresence(
      {
        lastActiveAt: r.lastActiveAt,
        lastHiddenAt: r.lastHiddenAt,
        manualStatus: r.manualStatus as ManualStatus,
      },
      now
    );
    if (status !== "offline") out[r.userId] = status;
  }
  return out;
}
