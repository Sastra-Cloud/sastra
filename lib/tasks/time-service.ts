import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { timeEntries, user } from "@/lib/db/schema";

/**
 * Internal time-tracking mutations. These take an explicit `userId` and are for
 * TRUSTED server callers only (never a "use server" RPC surface). Client-facing
 * actions live in `time-actions.ts` and derive the user from the session.
 */

function seconds(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 1000));
}

/**
 * Start a timer for `userId` on `taskId` (single running timer: any existing one
 * is stopped first). No-op if already running on this task. Atomic via txn; the
 * partial unique index guards races.
 */
export async function startTimerFor(
  userId: string,
  taskId: string,
  source: "timer" | "auto",
  note?: string | null
): Promise<void> {
  const now = new Date();
  await db.transaction(async (tx) => {
    const [running] = await tx
      .select({
        id: timeEntries.id,
        taskId: timeEntries.taskId,
        startedAt: timeEntries.startedAt,
      })
      .from(timeEntries)
      .where(and(eq(timeEntries.userId, userId), isNull(timeEntries.endedAt)))
      .limit(1);
    if (running?.taskId === taskId) return;
    if (running) {
      await tx
        .update(timeEntries)
        .set({
          endedAt: now,
          durationSeconds: seconds(running.startedAt, now),
          updatedAt: now,
        })
        .where(eq(timeEntries.id, running.id));
    }
    await tx.insert(timeEntries).values({
      taskId,
      userId,
      startedAt: now,
      source,
      note: note ?? null,
    });
  });
}

/**
 * Stop the user's running timer (optionally only if it's on `taskId`). Returns
 * the affected taskId, or null if nothing was running.
 */
export async function stopTimerFor(
  userId: string,
  taskId?: string
): Promise<string | null> {
  const now = new Date();
  const conds = [eq(timeEntries.userId, userId), isNull(timeEntries.endedAt)];
  if (taskId) conds.push(eq(timeEntries.taskId, taskId));
  const [running] = await db
    .select({
      id: timeEntries.id,
      taskId: timeEntries.taskId,
      startedAt: timeEntries.startedAt,
    })
    .from(timeEntries)
    .where(and(...conds))
    .limit(1);
  if (!running) return null;
  await db
    .update(timeEntries)
    .set({
      endedAt: now,
      durationSeconds: seconds(running.startedAt, now),
      updatedAt: now,
    })
    .where(eq(timeEntries.id, running.id));
  return running.taskId;
}

export async function isAutoStartEnabled(userId: string): Promise<boolean> {
  const [u] = await db
    .select({ v: user.autoStartTimer })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return u?.v ?? true;
}
