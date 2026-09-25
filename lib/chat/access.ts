import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { isMemberScopedChannel } from "@/lib/chat/channel-members";
import { db } from "@/lib/db";
import {
  chatChannelMembers,
  chatChannels,
  chatMessages,
  fileAttachments,
  files,
  user,
} from "@/lib/db/schema";
import { isAdminRole } from "@/lib/auth/policy";

export async function canAccessChannel(channelId: string, userId: string) {
  const [channel] = await db
    .select({
      kind: chatChannels.kind,
      memberUserId: chatChannelMembers.userId,
    })
    .from(chatChannels)
    .leftJoin(
      chatChannelMembers,
      and(
        eq(chatChannelMembers.channelId, chatChannels.id),
        eq(chatChannelMembers.userId, userId)
      )
    )
    .where(eq(chatChannels.id, channelId))
    .limit(1);

  if (!channel) return false;
  return (
    !isMemberScopedChannel(channel.kind) || channel.memberUserId === userId
  );
}

export async function requireChannelAccess(channelId: string, userId: string) {
  if (!(await canAccessChannel(channelId, userId))) {
    throw new Error("Conversation not found.");
  }
}

export async function canAccessMessage(messageId: string, userId: string) {
  const [message] = await db
    .select({
      kind: chatChannels.kind,
      memberUserId: chatChannelMembers.userId,
    })
    .from(chatMessages)
    .innerJoin(chatChannels, eq(chatChannels.id, chatMessages.channelId))
    .leftJoin(
      chatChannelMembers,
      and(
        eq(chatChannelMembers.channelId, chatChannels.id),
        eq(chatChannelMembers.userId, userId)
      )
    )
    .where(eq(chatMessages.id, messageId))
    .limit(1);

  if (!message) return false;
  return (
    !isMemberScopedChannel(message.kind) || message.memberUserId === userId
  );
}

export async function requireMessageAccess(messageId: string, userId: string) {
  if (!(await canAccessMessage(messageId, userId))) {
    throw new Error("Message not found.");
  }
}

/**
 * Workspace files are otherwise shared, but a file attached to a member-scoped
 * direct or custom channel inherits that conversation's access boundary.
 */
export async function canAccessFile(fileId: string, userId: string) {
  const [file] = await db
    .select({
      purpose: files.purpose,
      uploadedBy: files.uploadedBy,
      role: user.role,
      isActive: user.isActive,
    })
    .from(files)
    .leftJoin(user, eq(user.id, userId))
    .where(eq(files.id, fileId))
    .limit(1);
  if (!file) return false;
  if (file.purpose === "donation_import") {
    return file.isActive === true && isAdminRole(file.role);
  }

  const attachments = await db
    .select({ id: fileAttachments.id })
    .from(fileAttachments)
    .where(eq(fileAttachments.fileId, fileId))
    .limit(1);
  if (attachments.length === 0) {
    return (
      file.uploadedBy === userId ||
      (file.isActive === true && isAdminRole(file.role))
    );
  }

  const scopedAttachments = await db
    .select({ memberUserId: chatChannelMembers.userId })
    .from(fileAttachments)
    .innerJoin(
      chatMessages,
      and(
        eq(fileAttachments.targetType, "message"),
        eq(fileAttachments.targetId, chatMessages.id)
      )
    )
    .innerJoin(chatChannels, eq(chatChannels.id, chatMessages.channelId))
    .leftJoin(
      chatChannelMembers,
      and(
        eq(chatChannelMembers.channelId, chatChannels.id),
        eq(chatChannelMembers.userId, userId)
      )
    )
    .where(
      and(
        eq(fileAttachments.fileId, fileId),
        inArray(chatChannels.kind, ["direct", "custom"])
      )
    );

  return (
    scopedAttachments.length === 0 ||
    scopedAttachments.some((row) => row.memberUserId === userId)
  );
}
