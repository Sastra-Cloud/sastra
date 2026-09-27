import "server-only";

import { db } from "@/lib/db";
import { correspondenceMailboxSettings } from "@/lib/db/schema";
import { openSecret } from "@/lib/crypto/secret-box";

/**
 * Config for the Gmail correspondence hub, IMAP/SMTP flavour: we connect to a
 * shared capture mailbox with an app password (no Google Cloud project / admin
 * required), poll IMAP for new mail, and send via SMTP. The feature is optional
 * — with no mailbox configured, capture is off and every entry point no-ops.
 *
 * The mailbox comes from one of two places:
 * - server settings (`GMAIL_CAPTURE_MAILBOX` + `GMAIL_CAPTURE_APP_PASSWORD`),
 *   which win when present, so an existing installation keeps its setup; or
 * - the mailbox an admin connected in Settings ▸ Email, stored with its app
 *   password sealed (`correspondence_mailbox_settings`). This is how Sastra
 *   Cloud workspaces set it up themselves.
 *
 * Sastra Cloud also gives every workspace its own correspondence address,
 * `<name>@in.sastra.cloud` (`CORRESPONDENCE_ADDRESS`), which receives mail
 * through the signed inbound webhook. It is the default; a mailbox connected
 * in Settings replaces it.
 */

export type MailboxConfig = {
  mailbox: string;
  appPassword: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  source: "server" | "settings";
};

/** Google shows app passwords with spaces ("abcd efgh ijkl mnop"); strip them. */
export function normalizeAppPassword(raw: string | null | undefined): string | null {
  return raw ? raw.replace(/\s+/g, "") || null : null;
}

function hosts(env: Record<string, string | undefined> = process.env) {
  return {
    imapHost: env.GMAIL_IMAP_HOST?.trim() || "imap.gmail.com",
    imapPort: Number(env.GMAIL_IMAP_PORT) || 993,
    smtpHost: env.GMAIL_SMTP_HOST?.trim() || "smtp.gmail.com",
    smtpPort: Number(env.GMAIL_SMTP_PORT) || 465,
  };
}

/** The mailbox from server settings, or null when they are not set. */
export function serverMailboxConfig(env: Record<string, string | undefined> = process.env): MailboxConfig | null {
  const mailbox = env.GMAIL_CAPTURE_MAILBOX?.trim().toLowerCase() || null;
  const appPassword = normalizeAppPassword(env.GMAIL_CAPTURE_APP_PASSWORD);
  if (!mailbox || !appPassword) return null;
  return { mailbox, appPassword, ...hosts(env), source: "server" };
}

/** Whether server settings manage the mailbox (the Settings form is then read-only). */
export function mailboxManagedByServer(): boolean {
  return serverMailboxConfig() !== null;
}

/** The connected mailbox, or null when capture through Gmail is off. */
export async function getMailboxConfig(): Promise<MailboxConfig | null> {
  const server = serverMailboxConfig();
  if (server) return server;
  const [row] = await db.select().from(correspondenceMailboxSettings).limit(1);
  if (!row) return null;
  try {
    return { mailbox: row.mailbox, appPassword: openSecret(row.appPasswordSealed), ...hosts(), source: "settings" };
  } catch {
    // The encryption key changed; the admin has to connect the mailbox again.
    return null;
  }
}

/** Usable once a capture mailbox and its app password are configured. */
export async function isGmailCaptureEnabled(): Promise<boolean> {
  return (await getMailboxConfig()) !== null;
}

export async function getCaptureMailbox(): Promise<string | null> {
  return (await getMailboxConfig())?.mailbox ?? null;
}

/** Which transport delivers inbound correspondence, or null when none is set up. */
export type CaptureSource = "gmail" | "webhook" | "resend";

/**
 * How captured mail reaches Sastra. A Gmail mailbox is polled over IMAP;
 * otherwise a provider posts each message to the signed inbound webhook
 * (`INBOUND_WEBHOOK_SECRET`) or Resend's receiving webhook
 * (`RESEND_WEBHOOK_SECRET`). Gmail wins when several are configured.
 */
export async function getCorrespondenceCaptureSource(): Promise<CaptureSource | null> {
  if (await isGmailCaptureEnabled()) return "gmail";
  if (process.env.INBOUND_WEBHOOK_SECRET?.trim()) return "webhook";
  if (process.env.RESEND_WEBHOOK_SECRET?.trim()) return "resend";
  return null;
}

/** Whether any inbound capture path is configured. */
export async function isCorrespondenceCaptureEnabled(): Promise<boolean> {
  return (await getCorrespondenceCaptureSource()) !== null;
}

/** The address the server provides (`CORRESPONDENCE_ADDRESS`), such as Sastra Cloud's `<name>@in.sastra.cloud`. */
export function providedCorrespondenceAddress(env: Record<string, string | undefined> = process.env): string | null {
  return env.CORRESPONDENCE_ADDRESS?.trim().toLowerCase() || null;
}

/**
 * Which address is the correspondence address. A mailbox an admin connected in
 * Settings wins, because Sastra then sends through that mailbox; otherwise the
 * provided address, then a mailbox from the server settings.
 */
export function resolveCorrespondenceAddress(mailbox: Pick<MailboxConfig, "mailbox" | "source"> | null, provided: string | null): string | null {
  if (mailbox?.source === "settings") return mailbox.mailbox;
  return provided || mailbox?.mailbox || null;
}

/**
 * The workspace's correspondence address: the one teammates CC or forward to
 * and that quote requests, invoices, and replies are sent from.
 */
export async function getCorrespondenceAddress(): Promise<string | null> {
  return resolveCorrespondenceAddress(await getMailboxConfig(), providedCorrespondenceAddress());
}

/**
 * Whether Sastra can send as the correspondence address: through the Gmail
 * mailbox's own SMTP, or through the notification email provider when a
 * separate correspondence address is configured for it.
 */
export async function canSendAsCorrespondenceAddress(): Promise<boolean> {
  if (await isGmailCaptureEnabled()) return true;
  if (!process.env.CORRESPONDENCE_ADDRESS?.trim()) return false;
  return !!(process.env.RESEND_API_KEY?.trim() || process.env.SMTP_HOST?.trim());
}
