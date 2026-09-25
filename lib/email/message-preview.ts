import { segmentEmailBody } from "@/lib/email/body-segments";

export const EMAIL_MESSAGE_PREVIEW_LIMIT = 320;

export function emailMessagePreviewText(message: {
  subject: string | null;
  snippet: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
}) {
  const segments = segmentEmailBody({
    subject: message.subject,
    text: message.bodyText,
    html: message.bodyHtml,
  });
  const visible =
    segments.visibleText ||
    (!segments.historyText ? message.snippet?.trim() : "") ||
    (segments.isForwarded ? "Forwarded message" : "");
  const normalized = visible.replace(/\s+/g, " ").trim();
  return normalized
    ? normalized.slice(0, EMAIL_MESSAGE_PREVIEW_LIMIT)
    : null;
}
