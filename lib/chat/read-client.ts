"use client";

import { markChannelRead } from "@/lib/chat/actions";
import { requestNotificationRefresh } from "@/lib/notifications/client-events";

/** Badges clear after the read cursor saves; a failed receipt keeps them intact. */
export async function syncChannelRead(channelId: string, lastMessageId: string | null) {
  try {
    await markChannelRead(channelId, lastMessageId);
    requestNotificationRefresh();
  } catch {
    // Background receipt: preserve unread state and reconcile on the next visit.
  }
}
