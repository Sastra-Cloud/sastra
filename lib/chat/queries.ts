import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  ne,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/lib/db";
import {
  chatChannelMembers,
  channelReads,
  chatChannels,
  chatMessages,
  messageReactions,
  projectChatPins,
  projects,
  user,
} from "@/lib/db/schema";
import { requireChannelAccess } from "@/lib/chat/access";
import {
  isMemberScopedChannel,
  type ChannelMember,
} from "@/lib/chat/channel-members";
import {
  compareConversationActivity,
  compareProjectActivity,
  dedupeAndSortTeamChannels,
  selectProjectDestination,
} from "@/lib/chat/sidebar-order";
import { listAttachmentsByTargets, type Attachment } from "@/lib/files/queries";
import { serializeActivityTimestamp } from "@/lib/projects/activity-time";
import {
  DEFAULT_PROJECT_CHANNELS,
  ensureAllProjectChatChannels,
  ensureProjectChatChannels,
  projectChannelOrderSql,
} from "@/lib/chat/project-channels";

export type ChatReaction = { emoji: string; count: number; mine: boolean };
export type ChatMessageView = {
  id: string;
  userId: string | null;
  authorName: string | null;
  authorImage: string | null;
  content: string | null;
  status: string;
  createdAt: string;
  isMine: boolean;
  reactions: ChatReaction[];
  attachments: Attachment[];
};

const RECENT_LIMIT = 100;

export async function getRecentMessages(
  channelId: string,
  currentUserId: string
): Promise<ChatMessageView[]> {
  await requireChannelAccess(channelId, currentUserId);
  const rows = await db
    .select({
      id: chatMessages.id,
      userId: chatMessages.userId,
      authorName: user.name,
      authorImage: user.image,
      content: chatMessages.content,
      status: chatMessages.status,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .leftJoin(user, eq(user.id, chatMessages.userId))
    .where(
      and(eq(chatMessages.channelId, channelId), isNull(chatMessages.deletedAt))
    )
    .orderBy(desc(chatMessages.id))
    .limit(RECENT_LIMIT);
  rows.reverse();

  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const reactionRows = await db
    .select({
      messageId: messageReactions.messageId,
      emoji: messageReactions.emoji,
      count: sql<number>`count(*)::int`,
      mine: sql<boolean>`bool_or(${messageReactions.userId} = ${currentUserId})`,
    })
    .from(messageReactions)
    .where(inArray(messageReactions.messageId, ids))
    .groupBy(messageReactions.messageId, messageReactions.emoji);

  const reactionMap = new Map<string, ChatReaction[]>();
  for (const r of reactionRows) {
    const list = reactionMap.get(r.messageId) ?? [];
    list.push({ emoji: r.emoji, count: r.count, mine: r.mine });
    reactionMap.set(r.messageId, list);
  }

  const attachMap = await listAttachmentsByTargets("message", ids);

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    authorName: r.authorName,
    authorImage: r.authorImage,
    content: r.content,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    isMine: r.userId === currentUserId,
    reactions: reactionMap.get(r.id) ?? [],
    attachments: attachMap.get(r.id) ?? [],
  }));
}

/** Cheap signature of a channel's recent state; changes on any message/reaction edit. */
export async function getChannelSignature(
  channelId: string,
  currentUserId: string
): Promise<string> {
  await requireChannelAccess(channelId, currentUserId);
  const [m] = await db
    .select({
      maxId: sql<string>`coalesce(max(${chatMessages.id})::text, '')`,
      count: sql<number>`count(*)::int`,
      maxUpdated: sql<string>`coalesce(max(${chatMessages.updatedAt})::text, '')`,
    })
    .from(chatMessages)
    .where(eq(chatMessages.channelId, channelId));
  const [r] = await db
    .select({
      count: sql<number>`count(*)::int`,
      maxAt: sql<string>`coalesce(max(${messageReactions.createdAt})::text, '')`,
    })
    .from(messageReactions)
    .innerJoin(chatMessages, eq(chatMessages.id, messageReactions.messageId))
    .where(eq(chatMessages.channelId, channelId));
  return `${m.maxId}|${m.count}|${m.maxUpdated}|${r.count}|${r.maxAt}`;
}

export async function getChannelById(
  channelId: string,
  currentUserId: string
) {
  const [c] = await db
    .select({
      id: chatChannels.id,
      projectId: chatChannels.projectId,
      name: chatChannels.name,
      kind: chatChannels.kind,
      createdAt: chatChannels.createdAt,
      projectSlug: projects.slug,
      projectTitle: projects.title,
    })
    .from(chatChannels)
    .leftJoin(projects, eq(projects.id, chatChannels.projectId))
    .where(eq(chatChannels.id, channelId))
    .limit(1);
  if (!c) return null;
  if (!isMemberScopedChannel(c.kind)) {
    return {
      ...c,
      directUserId: null,
      directUserName: null,
      directUserImage: null,
      participantIds: [] as string[],
      channelMembers: [] as ChannelMember[],
    };
  }

  const participants = await db
    .select({
      id: user.id,
      name: user.name,
      image: user.image,
      role: user.role,
    })
    .from(chatChannelMembers)
    .innerJoin(user, eq(user.id, chatChannelMembers.userId))
    .where(eq(chatChannelMembers.channelId, channelId))
    .orderBy(asc(user.name));
  if (!participants.some((participant) => participant.id === currentUserId)) {
    return null;
  }
  if (c.kind === "custom") {
    return {
      ...c,
      directUserId: null,
      directUserName: null,
      directUserImage: null,
      participantIds: participants.map((participant) => participant.id),
      channelMembers: participants,
    };
  }
  const other = participants.find(
    (participant) => participant.id !== currentUserId
  );
  return {
    ...c,
    directUserId: other?.id ?? null,
    directUserName: other?.name ?? "Inactive teammate",
    directUserImage: other?.image ?? null,
    participantIds: participants.map((participant) => participant.id),
    channelMembers: participants,
  };
}

export async function getProjectChannel(projectId: string) {
  await ensureProjectChatChannels(projectId);
  const [c] = await db
    .select()
    .from(chatChannels)
    .where(and(eq(chatChannels.projectId, projectId), eq(chatChannels.kind, "project")))
    .orderBy(projectChannelOrderSql(), asc(chatChannels.name))
    .limit(1);
  return c ?? null;
}

export type ChannelListItem = {
  id: string;
  name: string;
  kind: string;
  unread: number;
  lastMessageAt: string | null;
};

export type DirectMessageListItem = {
  id: string;
  userId: string;
  name: string;
  image: string | null;
  unread: number;
  lastMessageAt: string | null;
};

export type DirectMessageCandidate = {
  id: string;
  name: string;
  image: string | null;
  role: string;
};

export type ProjectChannelListItem = {
  id: string;
  name: string;
  unread: number;
};

export type ProjectSidebarChannel = {
  id: string;
  name: string;
  unread: number;
  lastMessageAt: string | null;
  lastVisitedAt: string | null;
};

export type ProjectChatSummary = {
  projectId: string;
  projectSlug: string;
  projectTitle: string;
  pinned: boolean;
  pinnedAt: string | null;
  unread: number;
  hrefChannelId: string;
  hrefChannelName: string;
  hrefChannelVisitedAt: string | null;
  lastMessageAt: string | null;
  channels: ProjectSidebarChannel[];
};

export type ChatSidebarData = {
  directMessages: DirectMessageListItem[];
  directCandidates: DirectMessageCandidate[];
  channels: ChannelListItem[];
  projects: ProjectChatSummary[];
};

const myDirectMembership = alias(
  chatChannelMembers,
  "my_direct_membership"
);
const otherDirectMembership = alias(
  chatChannelMembers,
  "other_direct_membership"
);

export async function listDirectMessages(
  currentUserId: string
): Promise<DirectMessageListItem[]> {
  const rows = await db
    .select({
      id: chatChannels.id,
      userId: user.id,
      name: user.name,
      image: user.image,
      unread: sql<number>`count(${chatMessages.id}) filter (
        where ${chatMessages.id} > coalesce(${channelReads.lastReadMessageId}, '00000000-0000-0000-0000-000000000000'::uuid)
      )::int`,
      lastMessageAt: sql<Date | null>`max(${chatMessages.createdAt})`,
    })
    .from(myDirectMembership)
    .innerJoin(
      chatChannels,
      and(
        eq(chatChannels.id, myDirectMembership.channelId),
        eq(chatChannels.kind, "direct")
      )
    )
    .innerJoin(
      otherDirectMembership,
      and(
        eq(otherDirectMembership.channelId, chatChannels.id),
        ne(otherDirectMembership.userId, currentUserId)
      )
    )
    .innerJoin(user, eq(user.id, otherDirectMembership.userId))
    .leftJoin(
      channelReads,
      and(
        eq(channelReads.channelId, chatChannels.id),
        eq(channelReads.userId, currentUserId)
      )
    )
    .leftJoin(
      chatMessages,
      and(
        eq(chatMessages.channelId, chatChannels.id),
        isNull(chatMessages.deletedAt)
      )
    )
    .where(eq(myDirectMembership.userId, currentUserId))
    .groupBy(
      chatChannels.id,
      user.id,
      user.name,
      user.image,
      channelReads.lastReadMessageId
    )
    .orderBy(
      sql`max(${chatMessages.createdAt}) desc nulls last`,
      asc(user.name)
    );

  return rows
    .map((row) => ({
      ...row,
      lastMessageAt: serializeActivityTimestamp(row.lastMessageAt),
    }))
    .sort(compareConversationActivity);
}

export async function listDirectMessageCandidates(
  currentUserId: string
): Promise<DirectMessageCandidate[]> {
  return db
    .select({
      id: user.id,
      name: user.name,
      image: user.image,
      role: user.role,
    })
    .from(user)
    .where(
      and(
        eq(user.isBot, false),
        eq(user.isActive, true),
        ne(user.id, currentUserId)
      )
    )
    .orderBy(asc(user.name));
}

export async function listProjectChannels(
  projectId: string,
  currentUserId: string
): Promise<ProjectChannelListItem[]> {
  await ensureProjectChatChannels(projectId);

  return db
    .select({
      id: chatChannels.id,
      name: chatChannels.name,
      unread: sql<number>`count(${chatMessages.id})::int`,
    })
    .from(chatChannels)
    .leftJoin(
      channelReads,
      and(
        eq(channelReads.channelId, chatChannels.id),
        eq(channelReads.userId, currentUserId)
      )
    )
    .leftJoin(
      chatMessages,
      sql`${chatMessages.channelId} = ${chatChannels.id}
        and ${chatMessages.deletedAt} is null
        and ${chatMessages.id} > coalesce(${channelReads.lastReadMessageId}, '00000000-0000-0000-0000-000000000000'::uuid)`
    )
    .where(and(eq(chatChannels.projectId, projectId), eq(chatChannels.kind, "project")))
    .groupBy(chatChannels.id, chatChannels.name)
    .orderBy(projectChannelOrderSql(), asc(chatChannels.name));
}

const CHANNEL_SORT = new Map(
  DEFAULT_PROJECT_CHANNELS.map((name, index) => [name.toLowerCase(), index])
);

function channelRank(name: string) {
  return CHANNEL_SORT.get(name.toLowerCase()) ?? 99;
}

function dateRank(value: string | null) {
  return value ? Date.parse(value) : 0;
}

export async function listProjectChatSummaries(
  currentUserId: string
): Promise<ProjectChatSummary[]> {
  await ensureAllProjectChatChannels();

  const rows = await db
    .select({
      projectId: projects.id,
      projectSlug: projects.slug,
      projectTitle: projects.title,
      channelId: chatChannels.id,
      channelName: chatChannels.name,
      pinnedAt: projectChatPins.createdAt,
      lastVisitedAt: channelReads.updatedAt,
      unread: sql<number>`count(${chatMessages.id}) filter (
        where ${chatMessages.id} > coalesce(${channelReads.lastReadMessageId}, '00000000-0000-0000-0000-000000000000'::uuid)
      )::int`,
      lastMessageAt: sql<Date | null>`max(${chatMessages.createdAt})`,
    })
    .from(chatChannels)
    .innerJoin(projects, eq(projects.id, chatChannels.projectId))
    .leftJoin(
      projectChatPins,
      and(
        eq(projectChatPins.projectId, projects.id),
        eq(projectChatPins.userId, currentUserId)
      )
    )
    .leftJoin(
      channelReads,
      and(
        eq(channelReads.channelId, chatChannels.id),
        eq(channelReads.userId, currentUserId)
      )
    )
    .leftJoin(
      chatMessages,
      and(
        eq(chatMessages.channelId, chatChannels.id),
        isNull(chatMessages.deletedAt)
      )
    )
    .where(
      and(
        eq(chatChannels.kind, "project"),
        notInArray(projects.status, ["completed", "cancelled"])
      )
    )
    .groupBy(
      projects.id,
      projects.slug,
      projects.title,
      chatChannels.id,
      chatChannels.name,
      projectChatPins.createdAt,
      channelReads.updatedAt
    )
    .orderBy(
      desc(projectChatPins.createdAt),
      asc(projects.title),
      projectChannelOrderSql(),
      asc(chatChannels.name)
    );

  const grouped = new Map<ProjectChatSummary["projectId"], ProjectChatSummary>();
  for (const row of rows) {
    const summary =
      grouped.get(row.projectId) ??
      ({
        projectId: row.projectId,
        projectSlug: row.projectSlug,
        projectTitle: row.projectTitle,
        pinned: row.pinnedAt !== null,
        pinnedAt: row.pinnedAt?.toISOString() ?? null,
        unread: 0,
        hrefChannelId: row.channelId,
        hrefChannelName: row.channelName,
        hrefChannelVisitedAt: null,
        lastMessageAt: null,
        channels: [],
      } satisfies ProjectChatSummary);

    const lastMessageAt = serializeActivityTimestamp(row.lastMessageAt);
    summary.unread += row.unread;
    summary.channels.push({
      id: row.channelId,
      name: row.channelName,
      unread: row.unread,
      lastMessageAt,
      lastVisitedAt: row.lastVisitedAt?.toISOString() ?? null,
    });

    const currentRank = dateRank(summary.lastMessageAt);
    const candidateRank = dateRank(lastMessageAt);
    if (
      candidateRank > currentRank ||
      (candidateRank === currentRank &&
        channelRank(row.channelName) < channelRank(summary.hrefChannelName))
    ) {
      summary.hrefChannelId = row.channelId;
      summary.hrefChannelName = row.channelName;
      summary.lastMessageAt = lastMessageAt;
    }

    grouped.set(row.projectId, summary);
  }

  const summaries = [...grouped.values()].map((summary) => {
    summary.channels.sort((a, b) => channelRank(a.name) - channelRank(b.name));
    const destination = selectProjectDestination(
      summary.channels,
      channelRank
    );
    if (destination) {
      summary.hrefChannelId = destination.id;
      summary.hrefChannelName = destination.name;
      summary.hrefChannelVisitedAt = destination.lastVisitedAt;
    }
    return summary;
  });

  summaries.sort(compareProjectActivity);

  return summaries;
}

/** Standalone team channels with a per-user unread count. */
export async function listChannels(
  currentUserId: string
): Promise<ChannelListItem[]> {
  // One grouped pass: per-user unread = messages after this user's last-read id
  // for each channel (joined in), counted in a single query (no N+1).
  const rows = await db
    .select({
      id: chatChannels.id,
      name: chatChannels.name,
      kind: chatChannels.kind,
      unread: sql<number>`count(${chatMessages.id})::int`,
      lastMessageAt: sql<Date | null>`max(${chatMessages.createdAt})`,
    })
    .from(chatChannels)
    .leftJoin(
      chatChannelMembers,
      and(
        eq(chatChannelMembers.channelId, chatChannels.id),
        eq(chatChannelMembers.userId, currentUserId)
      )
    )
    .leftJoin(
      channelReads,
      and(
        eq(channelReads.channelId, chatChannels.id),
        eq(channelReads.userId, currentUserId)
      )
    )
    .leftJoin(
      chatMessages,
      sql`${chatMessages.channelId} = ${chatChannels.id}
        and ${chatMessages.deletedAt} is null
        and ${chatMessages.id} > coalesce(${channelReads.lastReadMessageId}, '00000000-0000-0000-0000-000000000000'::uuid)`
    )
    .where(
      and(
        ne(chatChannels.kind, "standup"),
        ne(chatChannels.kind, "direct"),
        isNull(chatChannels.projectId),
        or(
          eq(chatChannels.kind, "general"),
          and(
            eq(chatChannels.kind, "custom"),
            eq(chatChannelMembers.userId, currentUserId)
          )
        )
      )
    )
    .groupBy(
      chatChannels.id,
      chatChannels.name,
      chatChannels.kind,
      chatChannelMembers.userId
    )
    .orderBy(asc(chatChannels.kind), asc(chatChannels.name));

  return dedupeAndSortTeamChannels(
    rows.map((row) => ({
      ...row,
      lastMessageAt: serializeActivityTimestamp(row.lastMessageAt),
    }))
  );
}

export async function listChatSidebar(
  currentUserId: string
): Promise<ChatSidebarData> {
  const [directMessages, directCandidates, channels, projectSummaries] =
    await Promise.all([
      listDirectMessages(currentUserId),
      listDirectMessageCandidates(currentUserId),
      listChannels(currentUserId),
      listProjectChatSummaries(currentUserId),
    ]);
  return {
    directMessages,
    directCandidates,
    channels,
    projects: projectSummaries,
  };
}
