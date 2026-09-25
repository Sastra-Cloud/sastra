import "server-only";

/**
 * Config for the Gmail correspondence hub, IMAP/SMTP flavour: we connect to a
 * shared capture mailbox with an app password (no Google Cloud project / admin
 * required), poll IMAP for new mail, and send via SMTP. The feature is optional
 * — with no mailbox + app password set, `gmailEnabled()` is false and every
 * entry point no-ops.
 */

export function captureMailbox(): string | null {
  return process.env.GMAIL_CAPTURE_MAILBOX?.trim().toLowerCase() || null;
}

export function captureAppPassword(): string | null {
  // Google shows app passwords with spaces ("abcd efgh ijkl mnop"); strip them.
  const raw = process.env.GMAIL_CAPTURE_APP_PASSWORD;
  return raw ? raw.replace(/\s+/g, "") || null : null;
}

export function imapHost(): string {
  return process.env.GMAIL_IMAP_HOST?.trim() || "imap.gmail.com";
}

export function imapPort(): number {
  return Number(process.env.GMAIL_IMAP_PORT) || 993;
}

export function smtpHost(): string {
  return process.env.GMAIL_SMTP_HOST?.trim() || "smtp.gmail.com";
}

export function smtpPort(): number {
  return Number(process.env.GMAIL_SMTP_PORT) || 465;
}

/** Usable once a capture mailbox and its app password are configured. */
export function gmailEnabled(): boolean {
  return !!(captureMailbox() && captureAppPassword());
}

/** Which transport delivers inbound correspondence, or null when none is set up. */
export type CaptureSource = "gmail" | "webhook" | "resend";

/**
 * How captured mail reaches Sastra. A Gmail mailbox is polled over IMAP;
 * otherwise a provider posts each message to the signed inbound webhook
 * (`INBOUND_WEBHOOK_SECRET`) or Resend's receiving webhook
 * (`RESEND_WEBHOOK_SECRET`). Gmail wins when several are configured.
 */
export function correspondenceCaptureSource(): CaptureSource | null {
  if (gmailEnabled()) return "gmail";
  if (process.env.INBOUND_WEBHOOK_SECRET?.trim()) return "webhook";
  if (process.env.RESEND_WEBHOOK_SECRET?.trim()) return "resend";
  return null;
}

/** Whether any inbound capture path is configured. */
export function correspondenceCaptureEnabled(): boolean {
  return correspondenceCaptureSource() !== null;
}

/**
 * The workspace's correspondence address: the one teammates CC or forward to
 * and that quote requests, invoices, and replies are sent from. Either the
 * Gmail capture mailbox or, with another email provider, `CORRESPONDENCE_ADDRESS`.
 */
export function correspondenceAddress(): string | null {
  return process.env.CORRESPONDENCE_ADDRESS?.trim().toLowerCase() || captureMailbox();
}

/**
 * Whether Sastra can send as the correspondence address: through the Gmail
 * mailbox's own SMTP, or through the notification email provider when a
 * separate correspondence address is configured for it.
 */
export function correspondenceSendEnabled(): boolean {
  if (gmailEnabled()) return true;
  if (!process.env.CORRESPONDENCE_ADDRESS?.trim()) return false;
  return !!(process.env.RESEND_API_KEY?.trim() || process.env.SMTP_HOST?.trim());
}
