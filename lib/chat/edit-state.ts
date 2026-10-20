import type { ChatMessageView } from "./queries";

export type MessageEditDraft = { messageId: string; originalContent: string; originalEditedAt: string | null; text: string; error?: string };

/** A stale poll must not overwrite an optimistic edit; unrelated message state stays fresh. */
export function reconcileMessageEdits(current: ChatMessageView[], incoming: ChatMessageView[], protectedIds: Set<string>) {
  const previous = new Map(current.map(message => [message.id, message]));
  return incoming.map(message => {
    const saved = previous.get(message.id);
    return protectedIds.has(message.id) && saved ? { ...message, content: saved.content, editedAt: saved.editedAt } : message;
  });
}

export function restoreDeletedMessage(current: ChatMessageView[], message: ChatMessageView) {
  return current.some(item => item.id === message.id) ? current : [...current, message].sort((a, b) => a.id.localeCompare(b.id));
}

/** Pending or older reads cannot resurrect an optimistically deleted message. */
export function reconcileDeletedMessages(current: ChatMessageView[], incoming: ChatMessageView[], pending: Set<string>, changedSinceRead: Set<string>) {
  const present = new Set(current.map(message => message.id));
  return incoming.filter(message => !pending.has(message.id) && !(changedSinceRead.has(message.id) && !present.has(message.id)));
}
