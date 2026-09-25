/**
 * Deterministic email-body segmentation shared by the correspondence UI and
 * AI intake. The model should see the new reply for an ordinary message, while
 * a deliberate forward may carry entirely new history and therefore keeps its
 * full body available for analysis.
 */

const FORWARDED_SUBJECT_RE = /^(?:(?:fw|fwd)\s*:\s*)+/i;
const FORWARDED_MARKER_RE =
  /^\s*(?:-{2,}\s*)?(?:begin\s+)?forwarded message(?:\s*-{2,})?\s*:?\s*$/i;
const ORIGINAL_MARKER_RE =
  /^\s*(?:-{2,}\s*)?(?:original message|reply message)(?:\s*-{2,})?\s*:?\s*$/i;
const QUOTED_LINE_RE = /^\s*>/;
const HEADER_LINE_RE = /^\s*(from|sent|date|to|cc|subject):\s*\S/i;
const HTML_HISTORY_RE =
  /<(?:blockquote)\b|<(?:div|section)\b[^>]*(?:class\s*=\s*["'][^"']*\b(?:gmail_quote|yahoo_quoted)\b|id\s*=\s*["'](?:divRplyFwdMsg|appendonsend))/i;

export type EmailHistoryKind = "forwarded" | "quoted" | null;

export type EmailBodySegments = {
  visibleText: string;
  historyText: string | null;
  historyKind: EmailHistoryKind;
  isForwarded: boolean;
};

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (match, code: string) => {
      const point = Number(code);
      return Number.isInteger(point) && point >= 0 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : match;
    });
}

/** Plain-text fallback for the uncommon message that has HTML but no text part. */
export function emailHtmlToText(html: string | null | undefined): string {
  if (!html) return "";
  return decodeHtmlEntities(
    html
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:div|p|li|tr|h[1-6]|blockquote)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function clean(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/^\s+|\s+$/g, "")
    .replace(/\n{3,}/g, "\n\n");
}

function looksLikeOnWrote(lines: string[], index: number): boolean {
  if (!/^\s*On\s+\S/i.test(lines[index] ?? "")) return false;
  for (let end = index; end < Math.min(lines.length, index + 4); end++) {
    const candidate = lines.slice(index, end + 1).join(" ").replace(/\s+/g, " ");
    if (/\bwrote:\s*$/i.test(candidate)) return true;
  }
  return false;
}

function looksLikeHeaderBlock(lines: string[], index: number): boolean {
  if (!/^\s*From:\s*\S/i.test(lines[index] ?? "")) return false;
  if (index > 0 && lines[index - 1]?.trim()) return false;
  const fields = new Set<string>();
  for (const line of lines.slice(index, index + 9)) {
    const match = line.match(HEADER_LINE_RE);
    if (match) fields.add(match[1].toLowerCase());
  }
  return fields.has("from") && fields.has("subject") && fields.size >= 3;
}

/** Split the author-visible reply from repeated quoted or forwarded history. */
export function segmentEmailBody(input: {
  subject?: string | null;
  text?: string | null;
  html?: string | null;
}): EmailBodySegments {
  if (!input.text && input.html) {
    const htmlHistoryStart = input.html.search(HTML_HISTORY_RE);
    if (htmlHistoryStart >= 0) {
      const visibleText = emailHtmlToText(input.html.slice(0, htmlHistoryStart));
      const historyText = emailHtmlToText(input.html.slice(htmlHistoryStart));
      const isForwarded =
        FORWARDED_SUBJECT_RE.test(input.subject ?? "") ||
        FORWARDED_MARKER_RE.test(historyText.split("\n")[0] ?? "");
      return {
        visibleText,
        historyText: historyText || null,
        historyKind: isForwarded ? "forwarded" : "quoted",
        isForwarded,
      };
    }
  }
  const source = clean(input.text || emailHtmlToText(input.html));
  const lines = source.split("\n");
  const subjectForwarded = FORWARDED_SUBJECT_RE.test(input.subject ?? "");
  let historyStart = -1;
  let historyKind: EmailHistoryKind = null;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (FORWARDED_MARKER_RE.test(line)) {
      historyStart = index;
      historyKind = "forwarded";
      break;
    }
    if (
      ORIGINAL_MARKER_RE.test(line) ||
      QUOTED_LINE_RE.test(line) ||
      looksLikeOnWrote(lines, index) ||
      looksLikeHeaderBlock(lines, index)
    ) {
      historyStart = index;
      historyKind = subjectForwarded ? "forwarded" : "quoted";
      break;
    }
  }

  if (historyStart < 0) {
    return {
      visibleText: source,
      historyText: null,
      historyKind: null,
      isForwarded: subjectForwarded,
    };
  }

  const isForwarded = historyKind === "forwarded" || subjectForwarded;
  return {
    visibleText: clean(lines.slice(0, historyStart).join("\n")),
    historyText: clean(lines.slice(historyStart).join("\n")) || null,
    historyKind: isForwarded ? "forwarded" : "quoted",
    isForwarded,
  };
}

/**
 * Content for message-level AI work. Ordinary replies exclude duplicated quote
 * chains; forwards keep the complete body because the forwarded chain may be
 * the first copy Sastra has ever received.
 */
export function emailAnalysisText(input: {
  subject?: string | null;
  text?: string | null;
  html?: string | null;
}): string {
  const segments = segmentEmailBody(input);
  if (segments.isForwarded) {
    return clean(input.text || emailHtmlToText(input.html));
  }
  return segments.visibleText;
}
