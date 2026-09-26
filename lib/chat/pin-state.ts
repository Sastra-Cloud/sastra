/**
 * Shared shape and pure helpers for pinned chat messages. Safe to import from
 * client components: no database or server-only code lives here.
 */

/** The most pins a conversation's Pinned list shows (newest pin first). */
export const PINNED_LIST_LIMIT = 50;

/** Longest text excerpt kept for a pinned message in lists. */
export const PIN_EXCERPT_LENGTH = 280;

export type PinnedAttachmentSummary = {
  kind: "voice" | "file";
  name: string;
};

export type ChatPinnedMessage = {
  messageId: string;
  authorId: string | null;
  authorName: string | null;
  authorImage: string | null;
  /** Trimmed text, or null for attachment-only messages. */
  excerpt: string | null;
  attachments: PinnedAttachmentSummary[];
  /** When the message was sent (ISO). */
  sentAt: string;
  /** When the message was pinned (ISO). */
  pinnedAt: string;
  pinnedById: string | null;
  pinnedByName: string | null;
  /**
   * True when the message is inside the recent window the thread shows, so
   * the Pinned list can scroll to it. Older pins are listed without a jump.
   */
  inRecentWindow: boolean;
};

export type PinChange =
  | { type: "pin"; pin: ChatPinnedMessage }
  | { type: "unpin"; messageId: string };

export function pinExcerpt(content: string | null | undefined) {
  const text = content?.replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > PIN_EXCERPT_LENGTH
    ? `${text.slice(0, PIN_EXCERPT_LENGTH - 1).trimEnd()}…`
    : text;
}

export function summarizePinnedAttachments(
  attachments: Array<{
    originalName: string;
    mimeType: string;
    label: string | null;
  }>
): PinnedAttachmentSummary[] {
  return attachments.map((attachment) =>
    attachment.label === "voice" && attachment.mimeType.startsWith("audio/")
      ? { kind: "voice", name: attachment.originalName }
      : { kind: "file", name: attachment.originalName }
  );
}

/** Plain-language one-line description used when a message has no text. */
export function pinnedMessagePreview(pin: Pick<
  ChatPinnedMessage,
  "excerpt" | "attachments"
>) {
  if (pin.excerpt) return pin.excerpt;
  const voice = pin.attachments.find((item) => item.kind === "voice");
  if (voice) return "Voice message";
  const [first, ...rest] = pin.attachments;
  if (!first) return "Message";
  return rest.length > 0
    ? `${first.name} and ${rest.length} more ${rest.length === 1 ? "file" : "files"}`
    : first.name;
}

/** Newest pin first; the message id breaks ties so order is stable. */
export function sortPins(pins: ChatPinnedMessage[]) {
  return [...pins].sort(
    (a, b) =>
      Date.parse(b.pinnedAt) - Date.parse(a.pinnedAt) ||
      (a.messageId < b.messageId ? 1 : a.messageId > b.messageId ? -1 : 0)
  );
}

/**
 * Apply one pin or unpin to a conversation's pins. Idempotent, so an
 * optimistic change can be replayed on top of fresh server data safely.
 * Pinning a message that is already pinned keeps the original pin (the
 * server never overwrites who pinned first).
 */
export function applyPinChange(
  pins: ChatPinnedMessage[],
  change: PinChange
): ChatPinnedMessage[] {
  if (change.type === "unpin") {
    return pins.some((pin) => pin.messageId === change.messageId)
      ? pins.filter((pin) => pin.messageId !== change.messageId)
      : pins;
  }
  if (pins.some((pin) => pin.messageId === change.pin.messageId)) return pins;
  return sortPins([...pins, change.pin]).slice(0, PINNED_LIST_LIMIT);
}

/** Label for the small pin note on a message: "Pinned by you" / "Pinned by Dara". */
export function pinnedByLabel(
  pin: Pick<ChatPinnedMessage, "pinnedById" | "pinnedByName">,
  currentUserId: string
) {
  if (pin.pinnedById && pin.pinnedById === currentUserId) return "Pinned by you";
  return pin.pinnedByName ? `Pinned by ${pin.pinnedByName}` : "Pinned";
}
