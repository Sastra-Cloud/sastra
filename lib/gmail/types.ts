/**
 * Transport-agnostic normalized email shape. IMAP/mailparser produces it today;
 * a future OAuth/Gmail-API path could produce the same shape and feed the same
 * ingest. No server-only guard so the mapper stays unit-testable.
 */

export type NormalizedAddress = { name?: string; email: string };

export type NormalizedAttachment = {
  filename: string;
  mimeType: string;
  size: number;
  content: Buffer;
};

export type NormalizedMessage = {
  /** RFC 5322 Message-ID — our dedup key + reply In-Reply-To target. */
  messageId: string;
  /** Stable grouping key for a conversation (root Message-ID of the chain). */
  threadKey: string;
  /** Provider-native conversation id, such as Gmail X-GM-THRID. */
  providerThreadId: string | null;
  inReplyTo: string | null;
  references: string | null;
  from: NormalizedAddress | null;
  to: NormalizedAddress[];
  cc: NormalizedAddress[];
  subject: string | null;
  text: string | null;
  html: string | null;
  date: Date | null;
  attachments: NormalizedAttachment[];
};
