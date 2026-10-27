/** Small, non-recursive reply context shared by the thread and server queries. */
export type ChatReplyPreview = {
  messageId: string;
  authorName: string | null;
  preview: string;
  unavailable: boolean;
};

export function replyPreview(message: {
  id: string;
  authorName: string | null;
  content: string | null;
  attachments: Array<{ originalName: string; mimeType: string; label: string | null }>;
}): ChatReplyPreview {
  const text = message.content?.replace(/\s+/g, " ").trim();
  const [attachment, ...rest] = message.attachments;
  const attachmentText = attachment?.label === "voice" && attachment.mimeType.startsWith("audio/")
    ? "Voice message"
    : attachment?.originalName;
  return {
    messageId: message.id,
    authorName: message.authorName,
    preview: text
      ? text.length > 280 ? `${text.slice(0, 279).trimEnd()}…` : text
      : attachmentText
        ? `${attachmentText}${rest.length > 0 ? ` and ${rest.length} more` : ""}`
        : "Message",
    unavailable: false,
  };
}
