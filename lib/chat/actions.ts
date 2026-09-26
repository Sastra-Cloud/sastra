"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ilike, inArray, isNull, ne } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { z } from "zod";

import { requireRole, requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import {
  channelReads,
  chatChannelMembers,
  chatChannels,
  chatMessages,
  messageReactions,
  projectChatPins,
  projects,
  user,
} from "@/lib/db/schema";
import {
  requireChannelAccess,
  requireMessageAccess,
} from "@/lib/chat/access";
import {
  isMemberScopedChannel,
  type ChannelMember,
} from "@/lib/chat/channel-members";
import { directConversationKey } from "@/lib/chat/direct";
import { notifyMentions } from "@/lib/mentions/notify";
import {
  listAllMentionTargets,
  listMentionTargetsByIds,
  listProjectMentionTargets,
} from "@/lib/mentions/roster";
import { handleStandupAnswer } from "@/lib/standup/engine";
import { notify } from "@/lib/notifications";

/**
 * @mention detection → notify tagged users (excluding the author). Suggestions
 * and matching are scoped to the channel's team: a project channel taps its
 * members + managers; a team channel, everyone active.
 */
async function handleMentions(
  channelId: string,
  content: string | undefined,
  authorId: string,
  authorName: string
) {
  if (!content || !content.includes("@")) return [] as string[];
  const [channel] = await db
    .select({
      projectId: chatChannels.projectId,
      kind: chatChannels.kind,
    })
    .from(chatChannels)
    .where(eq(chatChannels.id, channelId))
    .limit(1);
  const members = channel?.projectId
    ? await listProjectMentionTargets(channel.projectId)
    : channel && isMemberScopedChannel(channel.kind)
      ? await db
          .select({ userId: chatChannelMembers.userId })
          .from(chatChannelMembers)
          .where(eq(chatChannelMembers.channelId, channelId))
          .then((rows) =>
            listMentionTargetsByIds(rows.map((row) => row.userId))
          )
      : await listAllMentionTargets();
  return notifyMentions({
    content,
    members,
    actorId: authorId,
    actorName: authorName,
    link: `/chat/${channelId}`,
    data: { channelId },
  });
}

async function notifyDirectRecipient(
  channelId: string,
  actorId: string,
  actorName: string,
  content: string | undefined,
  alreadyNotified: string[]
) {
  const [recipient] = await db
    .select({ userId: chatChannelMembers.userId })
    .from(chatChannelMembers)
    .innerJoin(chatChannels, eq(chatChannels.id, chatChannelMembers.channelId))
    .where(
      and(
        eq(chatChannelMembers.channelId, channelId),
        eq(chatChannels.kind, "direct"),
        ne(chatChannelMembers.userId, actorId)
      )
    )
    .limit(1);
  if (!recipient || alreadyNotified.includes(recipient.userId)) return;

  try {
    await notify({
      userId: recipient.userId,
      type: "direct_message",
      title: `${actorName} sent you a direct message`,
      body: content?.trim().slice(0, 160) || "Shared an attachment",
      link: `/chat/${channelId}`,
      data: { channelId, sentBy: actorId },
      email: false,
    });
  } catch (error) {
    console.error("Direct-message notification failed:", error);
  }
}

const createChannelSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Channel name is required")
    .max(60, "Keep channel names under 60 characters"),
  memberIds: z.array(z.string().min(1).max(200)).max(200),
});

const channelMemberSchema = z.object({
  channelId: z.string().uuid(),
  userId: z.string().min(1).max(200),
});

const projectPinSchema = z.object({
  projectId: z.string().uuid(),
  pinned: z.boolean(),
});

export type CreateChannelState = {
  error?: string;
  ok?: boolean;
  id?: string;
  memberCount?: number;
};

/**
 * Create a standalone team channel (kind "custom", no project). Restricted to
 * managers/admins — the same role gate used to create projects. The creator is
 * always included; selected active teammates receive explicit access.
 */
export async function createChannel(
  _prev: CreateChannelState,
  formData: FormData
): Promise<CreateChannelState> {
  const { user: actor } = await requireRole("manager");

  const parsed = createChannelSchema.safeParse({
    name: formData.get("name"),
    memberIds: formData.getAll("memberIds"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  // Tolerate a leading "#" the way people type channel names.
  const name = parsed.data.name.replace(/^#+\s*/, "").trim();
  if (!name) return { error: "Channel name is required" };

  const [dupe] = await db
    .select({ id: chatChannels.id })
    .from(chatChannels)
    .where(
      and(
        ilike(chatChannels.name, name),
        isNull(chatChannels.projectId),
        ne(chatChannels.kind, "standup"),
        ne(chatChannels.kind, "direct")
      )
    )
    .limit(1);
  if (dupe) return { error: "A channel with that name already exists" };

  const requestedIds = [
    ...new Set(parsed.data.memberIds.filter((id) => id !== actor.id)),
  ];
  const selectedMembers =
    requestedIds.length > 0
      ? await db
          .select({ id: user.id })
          .from(user)
          .where(
            and(
              inArray(user.id, requestedIds),
              eq(user.isActive, true),
              eq(user.isBot, false)
            )
          )
      : [];

  const created = await db.transaction(async (tx) => {
    const [channel] = await tx
      .insert(chatChannels)
      .values({ name, kind: "custom" })
      .returning({ id: chatChannels.id });
    if (!channel) throw new Error("Could not create the channel.");

    const memberIds = [
      actor.id,
      ...selectedMembers.map((member) => member.id),
    ];
    await tx
      .insert(chatChannelMembers)
      .values(memberIds.map((userId) => ({ channelId: channel.id, userId })))
      .onConflictDoNothing({
        target: [chatChannelMembers.channelId, chatChannelMembers.userId],
      });
    return { id: channel.id, memberCount: memberIds.length };
  });

  revalidatePath("/chat");
  return { ok: true, ...created };
}

async function requireCustomChannelManagerAccess(
  channelId: string,
  actorId: string
) {
  await requireChannelAccess(channelId, actorId);
  const [channel] = await db
    .select({ id: chatChannels.id })
    .from(chatChannels)
    .where(
      and(
        eq(chatChannels.id, channelId),
        eq(chatChannels.kind, "custom"),
        isNull(chatChannels.projectId)
      )
    )
    .limit(1);
  if (!channel) throw new Error("Channel membership cannot be changed.");
}

export async function addChannelMember(input: {
  channelId: string;
  userId: string;
}): Promise<ChannelMember> {
  const { user: actor } = await requireRole("manager");
  const parsed = channelMemberSchema.parse(input);
  await requireCustomChannelManagerAccess(parsed.channelId, actor.id);

  const [member] = await db
    .select({
      id: user.id,
      name: user.name,
      image: user.image,
      role: user.role,
    })
    .from(user)
    .where(
      and(
        eq(user.id, parsed.userId),
        eq(user.isActive, true),
        eq(user.isBot, false)
      )
    )
    .limit(1);
  if (!member) throw new Error("That teammate is not available.");

  await db
    .insert(chatChannelMembers)
    .values({ channelId: parsed.channelId, userId: member.id })
    .onConflictDoNothing({
      target: [chatChannelMembers.channelId, chatChannelMembers.userId],
    });

  revalidatePath("/chat");
  revalidatePath(`/chat/${parsed.channelId}`);
  return member;
}

export async function removeChannelMember(input: {
  channelId: string;
  userId: string;
}) {
  const { user: actor } = await requireRole("manager");
  const parsed = channelMemberSchema.parse(input);
  if (parsed.userId === actor.id) {
    throw new Error("You cannot remove yourself from a channel you manage.");
  }
  await requireCustomChannelManagerAccess(parsed.channelId, actor.id);

  const [membership] = await db
    .select({ id: chatChannelMembers.id })
    .from(chatChannelMembers)
    .where(
      and(
        eq(chatChannelMembers.channelId, parsed.channelId),
        eq(chatChannelMembers.userId, parsed.userId)
      )
    )
    .limit(1);
  if (!membership) throw new Error("That teammate is not in this channel.");

  await db
    .delete(chatChannelMembers)
    .where(eq(chatChannelMembers.id, membership.id));

  revalidatePath("/chat");
  revalidatePath(`/chat/${parsed.channelId}`);
  return { userId: parsed.userId };
}

export async function openDirectMessage(otherUserId: string) {
  const { user: actor } = await requireUser();
  const recipientId = z.string().min(1).max(200).parse(otherUserId);
  if (recipientId === actor.id) {
    throw new Error("Choose another teammate.");
  }

  const [recipient] = await db
    .select({ id: user.id })
    .from(user)
    .where(
      and(
        eq(user.id, recipientId),
        eq(user.isActive, true),
        eq(user.isBot, false)
      )
    )
    .limit(1);
  if (!recipient) throw new Error("That teammate is not available.");

  const directKey = directConversationKey(actor.id, recipientId);
  const channelId = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: chatChannels.id })
      .from(chatChannels)
      .where(eq(chatChannels.directKey, directKey))
      .limit(1);

    const [created] = existing
      ? [existing]
      : await tx
          .insert(chatChannels)
          .values({
            name: "Direct message",
            kind: "direct",
            directKey,
          })
          .onConflictDoNothing({ target: chatChannels.directKey })
          .returning({ id: chatChannels.id });

    const channel =
      created ??
      (
        await tx
          .select({ id: chatChannels.id })
          .from(chatChannels)
          .where(eq(chatChannels.directKey, directKey))
          .limit(1)
      )[0];
    if (!channel) throw new Error("Could not open the conversation.");

    await tx
      .insert(chatChannelMembers)
      .values([
        { channelId: channel.id, userId: actor.id },
        { channelId: channel.id, userId: recipientId },
      ])
      .onConflictDoNothing({
        target: [chatChannelMembers.channelId, chatChannelMembers.userId],
      });
    return channel.id;
  });

  revalidatePath("/chat");
  return { id: channelId };
}

export async function setProjectPinned(input: {
  projectId: string;
  pinned: boolean;
}) {
  const { user: actor } = await requireUser();
  const parsed = projectPinSchema.parse(input);

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, parsed.projectId))
    .limit(1);
  if (!project) throw new Error("Project not found.");

  if (parsed.pinned) {
    await db
      .insert(projectChatPins)
      .values({ projectId: parsed.projectId, userId: actor.id })
      .onConflictDoNothing({
        target: [projectChatPins.projectId, projectChatPins.userId],
      });
  } else {
    await db
      .delete(projectChatPins)
      .where(
        and(
          eq(projectChatPins.projectId, parsed.projectId),
          eq(projectChatPins.userId, actor.id)
        )
      );
  }

  revalidatePath("/chat");
}

const statusEnum = z.enum(["sent", "uploading", "failed"]);

/** Create a message immediately (status 'uploading' if attachments are pending). */
export async function postMessage(input: {
  channelId: string;
  content?: string;
  status?: "sent" | "uploading";
  clientNonce?: string;
}): Promise<{ id: string }> {
  const { user: actor } = await requireUser();
  await requireChannelAccess(input.channelId, actor.id);
  const id = uuidv7();
  await db.insert(chatMessages).values({
    id,
    channelId: input.channelId,
    userId: actor.id,
    content: input.content?.trim() || null,
    status: input.status ?? "sent",
    clientNonce: input.clientNonce,
  });
  const mentionedIds = await handleMentions(
    input.channelId,
    input.content,
    actor.id,
    actor.name
  );
  await notifyDirectRecipient(
    input.channelId,
    actor.id,
    actor.name,
    input.content,
    mentionedIds
  );
  // If this is a reply in the user's standup channel, advance the standup.
  if (input.content?.trim()) {
    await handleStandupAnswer(input.channelId, actor.id, input.content.trim());
  }
  return { id };
}

export async function setMessageStatus(messageId: string, status: string) {
  const { user: actor } = await requireUser();
  await requireMessageAccess(messageId, actor.id);
  const s = statusEnum.parse(status);
  await db
    .update(chatMessages)
    .set({ status: s, updatedAt: new Date() })
    .where(
      and(eq(chatMessages.id, messageId), eq(chatMessages.userId, actor.id))
    );
}

export async function toggleReaction(messageId: string, emoji: string) {
  const { user } = await requireUser();
  await requireMessageAccess(messageId, user.id);
  const e = emoji.slice(0, 16);
  const [existing] = await db
    .select({ id: messageReactions.id })
    .from(messageReactions)
    .where(
      and(
        eq(messageReactions.messageId, messageId),
        eq(messageReactions.userId, user.id),
        eq(messageReactions.emoji, e)
      )
    )
    .limit(1);

  if (existing) {
    await db.delete(messageReactions).where(eq(messageReactions.id, existing.id));
  } else {
    await db
      .insert(messageReactions)
      .values({ messageId, userId: user.id, emoji: e })
      .onConflictDoNothing();
  }
  // Bump message updatedAt so realtime detects the reaction change.
  await db
    .update(chatMessages)
    .set({ updatedAt: new Date() })
    .where(eq(chatMessages.id, messageId));
}

export async function deleteMessage(messageId: string) {
  const { user } = await requireUser();
  await requireMessageAccess(messageId, user.id);
  // A deleted message leaves the conversation's Pinned list too.
  await db
    .update(chatMessages)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
      pinnedAt: null,
      pinnedByUserId: null,
    })
    .where(
      and(eq(chatMessages.id, messageId), eq(chatMessages.userId, user.id))
    );
}

export async function markChannelRead(
  channelId: string,
  lastMessageId: string | null
) {
  const { user } = await requireUser();
  await requireChannelAccess(channelId, user.id);
  const update = lastMessageId
    ? { lastReadMessageId: lastMessageId, updatedAt: new Date() }
    : { updatedAt: new Date() };

  await db
    .insert(channelReads)
    .values({ channelId, userId: user.id, lastReadMessageId: lastMessageId })
    .onConflictDoUpdate({
      target: [channelReads.channelId, channelReads.userId],
      set: update,
    });
  revalidatePath("/chat");
}
