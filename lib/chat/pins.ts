import "server-only";

import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  ne,
  notInArray,
  or,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/lib/db";
import {
  chatChannelMembers,
  chatChannels,
  chatMessages,
  projects,
  user,
} from "@/lib/db/schema";
import { requireChannelAccess } from "@/lib/chat/access";
import { MEMBER_SCOPED_CHANNEL_KINDS } from "@/lib/chat/channel-members";
import {
  PINNED_LIST_LIMIT,
  pinExcerpt,
  summarizePinnedAttachments,
  type ChatPinnedMessage,
} from "@/lib/chat/pin-state";
import { RECENT_MESSAGE_LIMIT } from "@/lib/chat/queries";
import { listAttachmentsByTargets } from "@/lib/files/queries";

const pinner = alias(user, "pinner");
const pinMembership = alias(chatChannelMembers, "pin_membership");
const directPartner = alias(chatChannelMembers, "direct_partner");

type PinRow = {
  messageId: string;
  authorId: string | null;
  authorName: string | null;
  authorImage: string | null;
  content: string | null;
  sentAt: Date;
  pinnedAt: Date | null;
  pinnedById: string | null;
  pinnedByName: string | null;
};

const pinColumns = {
  messageId: chatMessages.id,
  authorId: chatMessages.userId,
  authorName: user.name,
  authorImage: user.image,
  content: chatMessages.content,
  sentAt: chatMessages.createdAt,
  pinnedAt: chatMessages.pinnedAt,
  pinnedById: chatMessages.pinnedByUserId,
  pinnedByName: pinner.name,
};

async function toPinViews(
  rows: PinRow[],
  inRecentWindow: (messageId: string) => boolean
): Promise<ChatPinnedMessage[]> {
  if (rows.length === 0) return [];
  const attachments = await listAttachmentsByTargets(
    "message",
    rows.map((row) => row.messageId)
  );
  return rows.map((row) => ({
    messageId: row.messageId,
    authorId: row.authorId,
    authorName: row.authorName,
    authorImage: row.authorImage,
    excerpt: pinExcerpt(row.content),
    attachments: summarizePinnedAttachments(
      attachments.get(row.messageId) ?? []
    ),
    sentAt: row.sentAt.toISOString(),
    pinnedAt: (row.pinnedAt ?? row.sentAt).toISOString(),
    pinnedById: row.pinnedById,
    pinnedByName: row.pinnedByName,
    inRecentWindow: inRecentWindow(row.messageId),
  }));
}

/**
 * Oldest message id the thread still loads. UUID v7 ids sort by time, so a
 * pinned message is visible in the thread when its id is at or after this.
 * Null means the whole conversation fits in the recent window.
 */
async function recentWindowStart(channelId: string) {
  const [row] = await db
    .select({ id: chatMessages.id })
    .from(chatMessages)
    .where(
      and(eq(chatMessages.channelId, channelId), isNull(chatMessages.deletedAt))
    )
    .orderBy(desc(chatMessages.id))
    .offset(RECENT_MESSAGE_LIMIT - 1)
    .limit(1);
  return row?.id ?? null;
}

/** A conversation's pinned messages, newest pin first. Checks access. */
export async function listChannelPins(
  channelId: string,
  currentUserId: string
): Promise<ChatPinnedMessage[]> {
  await requireChannelAccess(channelId, currentUserId);
  const [rows, windowStart] = await Promise.all([
    db
      .select(pinColumns)
      .from(chatMessages)
      .leftJoin(user, eq(user.id, chatMessages.userId))
      .leftJoin(pinner, eq(pinner.id, chatMessages.pinnedByUserId))
      .where(
        and(
          eq(chatMessages.channelId, channelId),
          isNotNull(chatMessages.pinnedAt),
          isNull(chatMessages.deletedAt)
        )
      )
      .orderBy(desc(chatMessages.pinnedAt), desc(chatMessages.id))
      .limit(PINNED_LIST_LIMIT),
    recentWindowStart(channelId),
  ]);
  return toPinViews(
    rows,
    (messageId) => windowStart === null || messageId >= windowStart
  );
}

/** One message's current pin, or null when it is not pinned (or deleted). */
export async function getMessagePin(
  messageId: string
): Promise<ChatPinnedMessage | null> {
  const [row] = await db
    .select({ ...pinColumns, channelId: chatMessages.channelId })
    .from(chatMessages)
    .leftJoin(user, eq(user.id, chatMessages.userId))
    .leftJoin(pinner, eq(pinner.id, chatMessages.pinnedByUserId))
    .where(
      and(
        eq(chatMessages.id, messageId),
        isNotNull(chatMessages.pinnedAt),
        isNull(chatMessages.deletedAt)
      )
    )
    .limit(1);
  if (!row) return null;
  const windowStart = await recentWindowStart(row.channelId);
  const [view] = await toPinViews(
    [row],
    (id) => windowStart === null || id >= windowStart
  );
  return view ?? null;
}

export type AccessiblePin = ChatPinnedMessage & {
  channelId: string;
  conversation: string;
  projectTitle: string | null;
};

/**
 * Pins across every conversation this person can read (workspace channels,
 * project channels, and private channels or direct messages they belong to),
 * newest pin first. Personal standup conversations are left out.
 */
export async function listAccessiblePins(
  currentUserId: string,
  options: {
    projectId?: string;
    channelId?: string;
    messageId?: string;
    limit?: number;
  } = {}
): Promise<AccessiblePin[]> {
  const filters: SQL[] = [
    isNotNull(chatMessages.pinnedAt),
    isNull(chatMessages.deletedAt),
    ne(chatChannels.kind, "standup"),
  ];
  const readable = or(
    notInArray(chatChannels.kind, [...MEMBER_SCOPED_CHANNEL_KINDS]),
    isNotNull(pinMembership.userId)
  );
  if (readable) filters.push(readable);
  if (options.projectId) {
    filters.push(eq(chatChannels.projectId, options.projectId));
  }
  if (options.channelId) filters.push(eq(chatChannels.id, options.channelId));
  if (options.messageId) filters.push(eq(chatMessages.id, options.messageId));

  const rows = await db
    .select({
      ...pinColumns,
      channelId: chatChannels.id,
      channelName: chatChannels.name,
      channelKind: chatChannels.kind,
      projectTitle: projects.title,
    })
    .from(chatMessages)
    .innerJoin(chatChannels, eq(chatChannels.id, chatMessages.channelId))
    .leftJoin(projects, eq(projects.id, chatChannels.projectId))
    .leftJoin(
      pinMembership,
      and(
        eq(pinMembership.channelId, chatChannels.id),
        eq(pinMembership.userId, currentUserId)
      )
    )
    .leftJoin(user, eq(user.id, chatMessages.userId))
    .leftJoin(pinner, eq(pinner.id, chatMessages.pinnedByUserId))
    .where(and(...filters))
    .orderBy(desc(chatMessages.pinnedAt), desc(chatMessages.id))
    .limit(Math.min(Math.max(options.limit ?? 30, 1), PINNED_LIST_LIMIT));

  const directChannelIds = [
    ...new Set(
      rows
        .filter((row) => row.channelKind === "direct")
        .map((row) => row.channelId)
    ),
  ];
  const partners =
    directChannelIds.length > 0
      ? await db
          .select({ channelId: directPartner.channelId, name: user.name })
          .from(directPartner)
          .innerJoin(user, eq(user.id, directPartner.userId))
          .where(
            and(
              inArray(directPartner.channelId, directChannelIds),
              ne(directPartner.userId, currentUserId)
            )
          )
      : [];
  const partnerByChannel = new Map(
    partners.map((partner) => [partner.channelId, partner.name])
  );

  const views = await toPinViews(rows, () => false);
  return views.map((view, index) => {
    const row = rows[index];
    const conversation =
      row.channelKind === "direct"
        ? `Direct message with ${partnerByChannel.get(row.channelId) ?? "a former teammate"}`
        : row.channelKind === "project" && row.projectTitle
          ? `${row.projectTitle} · #${row.channelName}`
          : `#${row.channelName}`;
    return {
      ...view,
      channelId: row.channelId,
      conversation,
      projectTitle: row.projectTitle,
    };
  });
}
