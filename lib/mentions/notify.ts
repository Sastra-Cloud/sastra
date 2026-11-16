import "server-only";

import { notifyMany } from "@/lib/notifications";
import { findMentionedIds, hasChannelMention, type MentionUser } from "./parse";

export type NotifyMentionsInput = {
  /** The text the author just wrote (comment, message, update, reply). */
  content: string | null | undefined;
  /** Roster to match handles against — already scoped to who may be tagged. */
  members: MentionUser[];
  actorId: string;
  actorName: string;
  /** Where the notification should take the recipient. */
  link: string;
  /** Human context for the title, e.g. a task title or project name. */
  context?: string;
  /** Project title shown as a context line in-app and in email. */
  project?: string;
  /** Notification type; defaults to "mention". */
  type?: string;
  /** Extra payload merged into the notification's `data`. */
  data?: Record<string, unknown>;
  /** Only chat channels opt in; the server supplies the authorized roster. */
  channelMentions?: boolean;
};

/**
 * Notify everyone @mentioned in `content` (the author is never notified about
 * their own message). Returns the notified user ids so callers can avoid
 * double-notifying the same people through another channel (e.g. a reply that
 * also mentions a thread participant).
 */
export async function notifyMentions(
  input: NotifyMentionsInput
): Promise<string[]> {
  const { content } = input;
  if (!content) return [];
  const channelMention = input.channelMentions === true && hasChannelMention(content, input.members);
  const ids = [...new Set(channelMention
    ? input.members.map((member) => member.id)
    : findMentionedIds(content, input.members))].filter(
    (id) => id !== input.actorId
  );
  if (ids.length === 0) return [];

  const title = channelMention
    ? `${input.actorName} notified everyone${input.context ? ` in ${input.context}` : " in the channel"}`
    : input.context
    ? `${input.actorName} mentioned you in ${input.context}`
    : `${input.actorName} mentioned you`;

  // Best-effort: a mention notification must never fail (or roll back) the
  // write that triggered it — the comment/message is what matters.
  try {
    await notifyMany(ids, {
      type: input.type ?? "mention",
      title,
      body: content.trim().slice(0, 160),
      project: input.project,
      link: input.link,
      data: { ...(input.data ?? {}), mentionedBy: input.actorId, ...(channelMention ? { channelMention: true } : {}) },
    });
  } catch (err) {
    console.error("notifyMentions failed:", err);
    return [];
  }

  return ids;
}
