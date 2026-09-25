import { createHash } from "node:crypto";
import { simpleParser } from "mailparser";

import { synthesizeMessageId } from "./message-id";
import { normalizeParsed } from "./normalize";
import type { NormalizedMessage } from "./types";

/**
 * Transport-neutral entry to the ingest pipeline: one RFC 822 message as bytes,
 * whether it came from an IMAP fetch, a signed webhook, or Resend's receiving
 * API. No `server-only` guard so the parsing half stays unit-testable.
 */

export type IngestSource = "imap" | "webhook" | "resend";

/** Largest raw message accepted from any transport (matches attachment ceiling). */
export const MAX_RAW_MESSAGE_BYTES = 25 * 1024 * 1024;

/** Parse raw RFC 822 bytes into the normalized shape the pipeline consumes. */
export async function parseRawMessage(
  raw: Buffer | string,
  options: { providerThreadId?: string | null } = {}
): Promise<NormalizedMessage> {
  const parsed = await simpleParser(raw);
  return normalizeParsed(parsed, { providerThreadId: options.providerThreadId ?? null });
}

/**
 * Dedup key for a message: its Message-ID header, or a stable synthesized id
 * when a forwarded / list message arrives without one.
 */
export function resolveMessageId(msg: NormalizedMessage): string {
  return (
    msg.messageId ||
    synthesizeMessageId({
      from: msg.from?.email,
      date: msg.date,
      subject: msg.subject,
      text: msg.text,
    })
  );
}

/** Stable storage key for a message's original `.eml`, derived from its Message-ID. */
export function rawMessageObjectKey(messageId: string): string {
  const digest = createHash("sha256").update(messageId.trim()).digest("hex");
  return `email/raw/${digest}.eml`;
}
