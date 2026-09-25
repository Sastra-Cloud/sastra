export type ChannelMember = {
  id: string;
  name: string;
  image: string | null;
  role: string;
};

export type ChannelMembershipChange =
  | { type: "add"; member: ChannelMember }
  | { type: "remove"; member: ChannelMember };

export function isMemberScopedChannel(kind: string) {
  return kind === "direct" || kind === "custom";
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
