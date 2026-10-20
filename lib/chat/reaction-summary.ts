import type { ChatReaction } from "./queries";

/** A message always has one compact badge; the full breakdown is opened on tap. */
export function summarizeReactions(reactions: readonly ChatReaction[]) {
  const ordered = reactions.filter(reaction => reaction.count > 0)
    .sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji));
  return {
    total: ordered.reduce((sum, reaction) => sum + reaction.count, 0),
    preview: ordered.slice(0, 3),
    hasMine: ordered.some(reaction => reaction.mine),
    ordered,
  };
}
