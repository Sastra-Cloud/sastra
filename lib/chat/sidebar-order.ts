type ActivityItem = {
  unread: number;
  lastMessageAt: string | null;
};

type TeamChannelActivity = ActivityItem & {
  name: string;
  kind: string;
};

type ProjectActivity = ActivityItem & {
  projectTitle: string;
  pinned: boolean;
  pinnedAt: string | null;
};

type ProjectChannelActivity = ActivityItem & {
  name: string;
  lastVisitedAt: string | null;
};

function timestampRank(value: string | null) {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function compareConversationActivity(
  a: ActivityItem,
  b: ActivityItem
) {
  const unreadDifference = Number(b.unread > 0) - Number(a.unread > 0);
  if (unreadDifference !== 0) return unreadDifference;

  const activityDifference =
    timestampRank(b.lastMessageAt) - timestampRank(a.lastMessageAt);
  if (activityDifference !== 0) return activityDifference;

  return b.unread - a.unread;
}

/**
 * Baseline bootstrapping historically allowed a second standalone #general
 * channel when a custom #general already existed. Keep the conversation with
 * activity and collapse case-insensitive duplicate names in the sidebar.
 */
export function dedupeAndSortTeamChannels<T extends TeamChannelActivity>(
  channels: T[]
): T[] {
  const preferred = [...channels].sort((a, b) => {
    const activity = compareConversationActivity(a, b);
    if (activity !== 0) return activity;

    const kindDifference =
      Number(a.kind !== "custom") - Number(b.kind !== "custom");
    if (kindDifference !== 0) return kindDifference;

    return a.name.localeCompare(b.name);
  });

  const seen = new Set<string>();
  return preferred.filter((channel) => {
    const key = channel.name.trim().toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function compareProjectActivity(
  a: ProjectActivity,
  b: ProjectActivity
) {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;

  const activity = compareConversationActivity(a, b);
  if (activity !== 0) return activity;

  if (a.pinned && b.pinned) {
    const pinnedDifference =
      timestampRank(b.pinnedAt) - timestampRank(a.pinnedAt);
    if (pinnedDifference !== 0) return pinnedDifference;
  }

  return a.projectTitle.localeCompare(b.projectTitle);
}

export function selectProjectDestination<T extends ProjectChannelActivity>(
  channels: T[],
  channelRank: (name: string) => number
): T | undefined {
  const unread = channels
    .filter((channel) => channel.unread > 0)
    .sort(
      (a, b) =>
        compareConversationActivity(a, b) ||
        channelRank(a.name) - channelRank(b.name)
    );
  if (unread[0]) return unread[0];

  const lastVisited = channels.reduce<T | undefined>((latest, channel) => {
    if (!channel.lastVisitedAt) return latest;
    if (!latest) return channel;
    return timestampRank(channel.lastVisitedAt) >
      timestampRank(latest.lastVisitedAt)
      ? channel
      : latest;
  }, undefined);
  if (lastVisited) return lastVisited;

  return (
    channels.find((channel) => channel.name.toLocaleLowerCase() === "general") ??
    channels[0]
  );
}
