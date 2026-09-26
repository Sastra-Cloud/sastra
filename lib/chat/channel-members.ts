export type ChannelMember = {
  id: string;
  name: string;
  image: string | null;
  role: string;
};

export type ChannelMembershipChange =
  | { type: "add"; member: ChannelMember }
  | { type: "remove"; member: ChannelMember };

/**
 * Channel kinds only their members can open (the rest are workspace-wide).
 * A standup conversation's only member is the person answering it.
 */
export const MEMBER_SCOPED_CHANNEL_KINDS = ["direct", "custom", "standup"] as const;

export function isMemberScopedChannel(kind: string) {
  return (MEMBER_SCOPED_CHANNEL_KINDS as readonly string[]).includes(kind);
}

export function updateChannelMembers(
  current: ChannelMember[],
  change: ChannelMembershipChange
) {
  if (change.type === "remove") {
    return current.filter((member) => member.id !== change.member.id);
  }

  if (current.some((member) => member.id === change.member.id)) return current;
  return [...current, change.member].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}
