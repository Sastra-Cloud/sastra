const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const FORWARDED_MARKER_RE =
  /(forwarded message|begin forwarded message|original message|^[-\s]*forwarded[-\s]*$)/im;
const FORWARDED_SUBJECT_RE = /^(fwd?|fw):/i;
const FORWARDED_HEADER_RE = /^\s*(?:>+\s*)?(from|to|cc|bcc):\s*(.+)$/i;
const FORWARDED_DATE_RE = /^\s*(?:>+\s*)?date:\s*(.+)$/i;

export type ForwardedHeaderHints = {
  isForwarded: boolean;
  emails: string[];
  fromEmails: string[];
  names: string[];
  fromNames: string[];
  /** Teammate-authored text before the forwarded marker. */
  forwarderNote: string | null;
  /** Parsed original Date header, when unambiguous. */
  originalDate: Date | null;
};

function unique(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(div|p|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function emailsFrom(value: string): string[] {
  return unique((value.match(EMAIL_RE) ?? []).map((email) => email.toLowerCase()));
}

function namesFrom(value: string): string[] {
  const withoutEmails = value
    .replace(EMAIL_RE, "")
    .replace(/[<>"']/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ");

  return unique(
    withoutEmails
      .split(/[;,]/)
      .map((part) => part.trim().replace(/^mailto:/i, "").replace(/:$/, ""))
      .filter((part) => part.length >= 2 && !/^(undisclosed recipients?)$/i.test(part))
  );
}

function contentFrom(input: {
  text?: string | null;
  html?: string | null;
}): string {
  return [input.text, input.html ? stripHtml(input.html) : null]
    .filter((value): value is string => !!value)
    .join("\n");
}

function preferredContent(input: {
  text?: string | null;
  html?: string | null;
}): string {
  return input.text || (input.html ? stripHtml(input.html) : "");
}

function cleanForwarderNote(value: string): string | null {
  const note = value
    .replace(/\n?\s*-{3,}\s*$/g, "")
    .replace(/^\s*(?:fyi|hello|hi|hey)[,!:]?\s*$/gim, (line) => line.trim())
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return note ? note.slice(0, 2_000) : null;
}

function parseForwardedDate(value: string): Date | null {
  // Gmail renders forwarded dates like "Tue, Oct 8, 2024 at 4:18 PM" and may
  // insert narrow/non-breaking spaces. Date.parse does not consistently accept
  // that display-only "at", so normalize it before parsing.
  const normalized = value
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/\s+at\s+(?=\d{1,2}:\d{2})/i, " ")
    .replace(/\s+/g, " ")
    .trim();
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Pull original From/To/Cc hints out of a forwarded message body. This lets the
 * capture mailbox treat "I forgot to CC projects@..." backfills like ordinary
 * captured correspondence for linking purposes.
 */
export function extractForwardedHeaderHints(input: {
  subject?: string | null;
  text?: string | null;
  html?: string | null;
}): ForwardedHeaderHints {
  const content = contentFrom(input);
  const markerIndex = content.search(FORWARDED_MARKER_RE);
  const subjectLooksForwarded = FORWARDED_SUBJECT_RE.test(input.subject ?? "");
  if (markerIndex < 0 && !subjectLooksForwarded) {
    return {
      isForwarded: false,
      emails: [],
      fromEmails: [],
      names: [],
      fromNames: [],
      forwarderNote: null,
      originalDate: null,
    };
  }

  const relevant = markerIndex >= 0 ? content.slice(markerIndex) : content;
  const preferred = preferredContent(input);
  const preferredMarkerIndex = preferred.search(FORWARDED_MARKER_RE);
  const forwarderNote =
    preferredMarkerIndex >= 0
      ? cleanForwarderNote(preferred.slice(0, preferredMarkerIndex))
      : null;
  const lines = relevant.split(/\r?\n/).slice(0, 90);
  const emails: string[] = [];
  const fromEmails: string[] = [];
  const names: string[] = [];
  const fromNames: string[] = [];
  let originalDate: Date | null = null;

  for (const line of lines) {
    const dateHeader = line.match(FORWARDED_DATE_RE);
    if (dateHeader && !originalDate) {
      originalDate = parseForwardedDate(dateHeader[1]);
      continue;
    }
    const header = line.match(FORWARDED_HEADER_RE);
    if (header) {
      const field = header[1].toLowerCase();
      const value = header[2];
      const lineEmails = emailsFrom(value);
      const lineNames = namesFrom(value);
      emails.push(...lineEmails);
      names.push(...lineNames);
      if (field === "from") {
        fromEmails.push(...lineEmails);
        fromNames.push(...lineNames);
      }
      continue;
    }

    const lineEmails = emailsFrom(line);
    if (lineEmails.length && /\bwrote:\s*$/i.test(line)) {
      emails.push(...lineEmails);
      fromEmails.push(...lineEmails);
      const beforeAddress = line.slice(0, line.search(EMAIL_RE)).split(/,\s*/).pop();
      if (beforeAddress) {
        const lineNames = namesFrom(beforeAddress);
        names.push(...lineNames);
        fromNames.push(...lineNames);
      }
    }
  }

  return {
    isForwarded: true,
    emails: unique(emails),
    fromEmails: unique(fromEmails),
    names: unique(names),
    fromNames: unique(fromNames),
    forwarderNote,
    originalDate,
  };
}
