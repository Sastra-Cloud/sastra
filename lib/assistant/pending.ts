import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { assistantMessages, assistantPendingActions } from "@/lib/db/schema";

/**
 * Decline every still-pending action for a user (they backed out). We only flip
 * statuses — the tool results for the now-dangling calls are synthesized when the
 * transcript is rebuilt, so this never leaves the history malformed no matter when
 * it runs (the deterministic fast-path, or a mid-turn cancel_pending_actions call).
 */
export async function cancelAllPending(userId: string): Promise<number> {
  const pending = await db
    .select({
      id: assistantPendingActions.id,
      messageId: assistantPendingActions.messageId,
    })
    .from(assistantPendingActions)
    .where(
      and(
        eq(assistantPendingActions.userId, userId),
        eq(assistantPendingActions.status, "pending")
      )
    );
  if (pending.length === 0) return 0;

  const messageIds = new Set<string>();
  for (const pa of pending) {
    await db
      .update(assistantPendingActions)
      .set({
        status: "declined",
        result: "Cancelled by the user.",
        resolvedAt: new Date(),
      })
      .where(eq(assistantPendingActions.id, pa.id));
    messageIds.add(pa.messageId);
  }
  for (const id of messageIds) {
    await db
      .update(assistantMessages)
      .set({ status: "complete" })
      .where(eq(assistantMessages.id, id));
  }
  return pending.length;
}
