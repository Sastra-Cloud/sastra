import "server-only";

import { and, eq } from "drizzle-orm";

import { isMemberScopedChannel } from "@/lib/chat/channel-members";
import { db } from "@/lib/db";
import {
  chatChannelMembers,
  chatChannels,
  chatMessages,
  fileAttachments,
  files,
  tasks,
  user,
} from "@/lib/db/schema";
import { canManage, isAdminRole } from "@/lib/auth/policy";
import { getWorkspaceSettings } from "@/lib/workspace/queries";
import { moduleEnabled } from "@/lib/workspace/modules";
import { canReadTask } from "@/lib/tasks/access";

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
 * Private chat files retain their membership boundary even when also attached
 * elsewhere. Other files need an accessible attachment surface: correspondence
 * and agreement groups require managers, and standalone tasks keep their scope.
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
  if (!file || file.isActive !== true) return false;
  if (file.purpose === "donation_import") {
    return file.isActive === true && isAdminRole(file.role);
  }
  if (file.purpose === "sponsorship_invoice") {
    return file.isActive === true && (file.role === "manager" || isAdminRole(file.role)) &&
      moduleEnabled((await getWorkspaceSettings()).enabledModules, "sponsorships");
  }

  const attachments = await db
    .select({
      targetType: fileAttachments.targetType,
      channelKind: chatChannels.kind,
      memberUserId: chatChannelMembers.userId,
      taskId: tasks.id,
      taskProjectId: tasks.projectId,
      taskAssignedTo: tasks.assignedTo,
      taskCreatedBy: tasks.createdBy,
    })
    .from(fileAttachments)
    .leftJoin(
      chatMessages,
      and(
        eq(fileAttachments.targetType, "message"),
        eq(fileAttachments.targetId, chatMessages.id)
      )
    )
    .leftJoin(chatChannels, eq(chatChannels.id, chatMessages.channelId))
    .leftJoin(
      chatChannelMembers,
      and(
        eq(chatChannelMembers.channelId, chatChannels.id),
        eq(chatChannelMembers.userId, userId)
      )
    )
    .leftJoin(tasks, and(
      eq(fileAttachments.targetType, "task"),
      eq(fileAttachments.targetId, tasks.id)
    ))
    .where(eq(fileAttachments.fileId, fileId));

  if (attachments.length === 0) {
    return file.uploadedBy === userId || isAdminRole(file.role);
  }
  const privateChats = attachments.filter((attachment) =>
    attachment.targetType === "message" && attachment.channelKind !== null &&
    isMemberScopedChannel(attachment.channelKind));
  if (privateChats.length > 0 && !privateChats.some((attachment) => attachment.memberUserId === userId)) {
    return false;
  }
  return attachments.some((attachment) => {
    switch (attachment.targetType) {
      case "email_message":
      case "agreement_group":
        return canManage(file.role);
      case "message":
        return attachment.channelKind !== null && (
          !isMemberScopedChannel(attachment.channelKind) ||
          attachment.memberUserId === userId
        );
      case "task":
        return attachment.taskId !== null && canReadTask({ id: userId, role: file.role }, {
          projectId: attachment.taskProjectId,
          assignedTo: attachment.taskAssignedTo,
          createdBy: attachment.taskCreatedBy,
        });
      case "rights_item":
      case "budget_item":
      case "project":
      case "print_quote":
      case "print_payment":
      case "license_fee_payment":
        return true;
      default:
        return false;
    }
  });
}
