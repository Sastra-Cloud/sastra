"use server";

import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { chatMessages } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/guards";
import { requireMessageAccess } from "@/lib/chat/access";
import type { ActionResult } from "@/lib/actions/result";

const inputSchema = z.object({
  messageId: z.string().uuid(),
  content: z.string().trim().min(1).max(20000),
  expectedContent: z.string(),
  expectedEditedAt: z.iso.datetime().nullable(),
});

export async function editMessage(input: z.input<typeof inputSchema>): Promise<ActionResult<{ id: string; content: string; editedAt: string }>> {
  const { user } = await requireUser();
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: { message: "Use between 1 and 20,000 characters.", code: "VALIDATION" } };
  const { messageId, content, expectedContent, expectedEditedAt } = parsed.data;
  await requireMessageAccess(messageId, user.id);
  const [message] = await db.select({ userId: chatMessages.userId, content: chatMessages.content, status: chatMessages.status, deletedAt: chatMessages.deletedAt })
    .from(chatMessages).where(eq(chatMessages.id, messageId)).limit(1);
  if (!message || message.userId !== user.id || message.deletedAt || message.status !== "sent" || !message.content) {
    return { ok: false, error: { message: "Only your own sent text messages can be edited.", code: "FORBIDDEN" } };
  }
  const now = new Date();
  const [updated] = await db.update(chatMessages).set({ content, editedAt: now, updatedAt: now })
    .where(and(eq(chatMessages.id, messageId), eq(chatMessages.userId, user.id), isNull(chatMessages.deletedAt),
      eq(chatMessages.content, expectedContent), expectedEditedAt ? eq(chatMessages.editedAt, new Date(expectedEditedAt)) : isNull(chatMessages.editedAt)))
    .returning({ id: chatMessages.id, content: chatMessages.content, editedAt: chatMessages.editedAt });
  if (!updated) return { ok: false, error: { message: "This message changed or was deleted. Cancel and reopen Edit to review the latest version.", code: "CONFLICT" } };
  // Editing is a correction: do not resend mentions, DM alerts, or standup submissions.
  return { ok: true, data: { id: updated.id, content: updated.content!, editedAt: updated.editedAt!.toISOString() } };
}
