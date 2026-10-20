import type { ChatMessageView } from "./queries";

/** Polling can update message content without replacing an in-flight reaction. */
export function reconcileReactionMessages(current: ChatMessageView[], incoming: ChatMessageView[], protectedIds: Set<string>) {
  const previous = new Map(current.map(message => [message.id, message]));
  return incoming.map(message => protectedIds.has(message.id) && previous.has(message.id)
    ? { ...message, reactions: previous.get(message.id)!.reactions }
    : message);
}
