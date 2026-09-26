"use server";

import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";

import type { ActionResult } from "@/lib/actions/result";
import { requireUser } from "@/lib/auth/guards";
import { canAccessMessage } from "@/lib/chat/access";
import type { ChatPinnedMessage } from "@/lib/chat/pin-state";
import { getMessagePin } from "@/lib/chat/pins";
import { db } from "@/lib/db";
import { chatMessages } from "@/lib/db/schema";

const messageIdSchema = z.string().uuid();

// The same words for "missing" and "no access", so a removed teammate learns
// nothing about a private conversation.
const MESSAGE_UNAVAILABLE =
  "We could not find this message. Refresh the page and try again.";
const MESSAGE_DELETED = "This message was deleted, so it cannot be pinned.";

function failure(message: string) {
  return { ok: false as const, error: { message } };
}

/**
 * Only people who can read the conversation (checked on the server with the
 * session user, never client input) may change its pins.
 */
async function readableMessageId(messageId: unknown, userId: string) {
  const parsed = messageIdSchema.safeParse(messageId);
  if (!parsed.success) return null;
  return (await canAccessMessage(parsed.data, userId)) ? parsed.data : null;
}

/**
 * Pin a message for everyone in its conversation. Pinning an already pinned
 * message keeps the first pin (who and when) and returns it.
 */
export async function pinMessage(
  messageId: string
): Promise<ActionResult<ChatPinnedMessage>> {
  const { user: actor } = await requireUser();
  const id = await readableMessageId(messageId, actor.id);
  if (!id) return failure(MESSAGE_UNAVAILABLE);

  const now = new Date();
  await db
    .update(chatMessages)
    .set({ pinnedAt: now, pinnedByUserId: actor.id, updatedAt: now })
    .where(
      and(
        eq(chatMessages.id, id),
        isNull(chatMessages.deletedAt),
        isNull(chatMessages.pinnedAt)
      )
    );

  const pin = await getMessagePin(id);
  if (!pin) return failure(MESSAGE_DELETED);
  return { ok: true, data: pin };
}

/** Remove a message's pin for everyone in its conversation. */
export async function unpinMessage(
  messageId: string
): Promise<ActionResult<{ messageId: string }>> {
  const { user: actor } = await requireUser();
  const id = await readableMessageId(messageId, actor.id);
  if (!id) return failure(MESSAGE_UNAVAILABLE);

  await db
    .update(chatMessages)
    .set({ pinnedAt: null, pinnedByUserId: null, updatedAt: new Date() })
    .where(and(eq(chatMessages.id, id), isNotNull(chatMessages.pinnedAt)));

  return { ok: true, data: { messageId: id } };
}
