import "server-only";

import { ImapFlow } from "imapflow";

import { getMailboxConfig, type MailboxConfig } from "./config";

/** IMAP fetch cursor: UIDs are only valid within a given UIDVALIDITY. */
export type ImapCursor = { uidValidity: string | null; lastUid: number };

/** One raw RFC 822 message as fetched; parsing happens in the shared ingest. */
export type RawImapMessage = {
  uid: number;
  source: Buffer;
  /** Gmail's X-GM-THRID when the server exposes it. */
  providerThreadId: string | null;
};

export type ImapFetchResult = {
  messages: RawImapMessage[];
  uidValidity: string;
  lastUid: number;
};

const MAX_PER_POLL = 50;

export function imapClientFor(config: Pick<MailboxConfig, "mailbox" | "appPassword" | "imapHost" | "imapPort">): ImapFlow {
  return new ImapFlow({
    host: config.imapHost,
    port: config.imapPort,
    secure: true,
    auth: { user: config.mailbox, pass: config.appPassword },
    logger: false,
  });
}

async function makeClient(): Promise<ImapFlow> {
  const config = await getMailboxConfig();
  if (!config) {
    throw new Error("Gmail capture mailbox / app password not configured.");
  }
  return imapClientFor(config);
}

/**
 * Pull messages newer than the cursor from INBOX. On a UIDVALIDITY change (rare
 * — mailbox reset) we start from scratch. Bounded per poll; the cursor advances
 * so the next poll continues where this left off.
 */
export async function fetchNewMessages(
  cursor: ImapCursor
): Promise<ImapFetchResult> {
  const client = await makeClient();
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    const box = client.mailbox;
    const uidValidity = box ? String(box.uidValidity) : "0";
    const sameValidity = cursor.uidValidity === uidValidity;
    const startUid = sameValidity && cursor.lastUid > 0 ? cursor.lastUid + 1 : 1;

    const messages: RawImapMessage[] = [];
    let lastUid = sameValidity ? cursor.lastUid : 0;

    for await (const msg of client.fetch(
      `${startUid}:*`,
      { uid: true, source: true, threadId: true },
      { uid: true }
    )) {
      // `n:*` always returns the last message even when none are ≥ n — skip it.
      if (msg.uid < startUid) continue;
      if (msg.source) {
        messages.push({
          uid: msg.uid,
          source: msg.source,
          providerThreadId: msg.threadId?.trim() || null,
        });
      }
      if (msg.uid > lastUid) lastUid = msg.uid;
      if (messages.length >= MAX_PER_POLL) break;
    }
    return { messages, uidValidity, lastUid };
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }
}

/**
 * Fetch one already-captured message's raw bytes again — the fallback for
 * attachment repair on messages captured before their `.eml` was kept in storage.
 */
export async function fetchMessageByMessageId(
  messageId: string
): Promise<Omit<RawImapMessage, "uid"> | null> {
  const normalizedId = messageId.trim();
  if (!normalizedId) return null;

  const client = await makeClient();
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    const matches = await client.search(
      { header: { "Message-ID": normalizedId } },
      { uid: true }
    );
    const uid = Array.isArray(matches) ? matches.at(-1) : null;
    if (!uid) return null;

    const message = await client.fetchOne(
      uid,
      { source: true, threadId: true },
      { uid: true }
    );
    if (!message || !message.source) return null;
    return {
      source: message.source,
      providerThreadId: message.threadId?.trim() || null,
    };
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }
}
