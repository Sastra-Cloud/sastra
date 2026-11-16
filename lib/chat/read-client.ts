"use client";

import { markChannelRead } from "@/lib/chat/actions";
import { requestNotificationRefresh } from "@/lib/notifications/client-events";

// In-flight work only: never retain read state across visits or accounts.
const pendingReceipts = new Map<string, Promise<void>>();

/** Badges clear after the read cursor saves; a failed receipt keeps them intact. */
export function syncChannelRead(channelId: string, lastMessageId: string | null, userId: string) {
  const key = JSON.stringify([userId, channelId, lastMessageId]);
  const pending = pendingReceipts.get(key);
  if (pending) return pending;
  const receipt = (async () => {
    try {
      await markChannelRead(channelId, lastMessageId);
      requestNotificationRefresh();
    } catch {
      // Background receipt: preserve unread state and reconcile on the next visit.
    }
  })();
  pendingReceipts.set(key, receipt);
  void receipt.finally(() => pendingReceipts.delete(key));
  return receipt;
}
