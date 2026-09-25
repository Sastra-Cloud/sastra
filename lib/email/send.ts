import "server-only";

import { randomUUID } from "node:crypto";
import type { Transporter } from "nodemailer";

/**
 * One place every outbound email goes through. The provider is chosen from
 * the environment:
 *
 * - `smtp` (default): Nodemailer over `SMTP_*`; works on any host that allows
 *   outbound SMTP (Coolify, VPS, Mailpit in development).
 * - `resend`: Resend's HTTPS API (`RESEND_API_KEY`); works where SMTP ports
 *   are blocked, such as Railway's Hobby plan.
 *
 * Every message leaves with an explicit Message-ID, so callers can store it
 * for threading regardless of what the provider would have generated.
 */
export type EmailProvider = "smtp" | "resend";

export type EmailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export type OutboundEmail = {
  /** Defaults to `EMAIL_FROM` / `SMTP_FROM`. */
  from?: string;
  to: string | string[];
  cc?: string | string[];
  replyTo?: string;
  subject: string;
  text?: string;
  html?: string;
  headers?: Record<string, string>;
  /** RFC 5322 Message-ID, angle brackets included. Generated when omitted. */
  messageId?: string;
  inReplyTo?: string;
  references?: string;
  attachments?: EmailAttachment[];
};

export type SendMailResult = {
  provider: EmailProvider;
  /** The Message-ID the message was sent with. */
  messageId: string;
  /** The provider's own id, when it returns one (Resend). */
  providerId?: string;
};

type Env = Record<string, string | undefined>;

export function resolveEmailProvider(env: Env): EmailProvider {
  const explicit = env.EMAIL_PROVIDER?.trim().toLowerCase();
  if (explicit === "resend" || explicit === "smtp") return explicit;
  return env.RESEND_API_KEY?.trim() ? "resend" : "smtp";
}

/** Whether the selected provider has the settings it needs to send. */
export function emailProviderConfigured(env: Env): boolean {
  const provider = resolveEmailProvider(env);
  if (provider === "resend") return Boolean(env.RESEND_API_KEY?.trim());
  return Boolean(env.SMTP_HOST?.trim());
}

export function defaultFromAddress(env: Env): string {
  return env.EMAIL_FROM?.trim() || env.SMTP_FROM?.trim() || "Sastra <noreply@localhost>";
}

/** The bare address inside `Name <addr@host>` or a plain address. */
export function addressOf(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1] : value).trim();
}

export function domainOf(address: string): string {
  const at = addressOf(address).lastIndexOf("@");
  return at >= 0 ? addressOf(address).slice(at + 1) : "localhost";
}

export function newMessageId(from: string): string {
  return `<${randomUUID()}@${domainOf(from)}>`;
}

const toList = (value: string | string[] | undefined): string[] | undefined =>
  value === undefined ? undefined : Array.isArray(value) ? value : [value];

export type ResendPayload = {
  from: string;
  to: string[];
  cc?: string[];
  reply_to?: string;
  subject: string;
  text?: string;
  html?: string;
  headers?: Record<string, string>;
  attachments?: Array<{ filename: string; content: string; content_type?: string }>;
};

/** Shape an email for `POST https://api.resend.com/emails`. Pure, for tests. */
export function buildResendPayload(email: OutboundEmail & { from: string; messageId: string }): ResendPayload {
  const headers: Record<string, string> = { ...(email.headers ?? {}), "Message-ID": email.messageId };
  if (email.inReplyTo) headers["In-Reply-To"] = email.inReplyTo;
  if (email.references) headers.References = email.references;
  const payload: ResendPayload = {
    from: email.from,
    to: toList(email.to) ?? [],
    subject: email.subject,
    headers,
  };
  const cc = toList(email.cc);
  if (cc?.length) payload.cc = cc;
  if (email.replyTo) payload.reply_to = email.replyTo;
  if (email.text) payload.text = email.text;
  if (email.html) payload.html = email.html;
  if (email.attachments?.length) {
    payload.attachments = email.attachments.map((a) => ({
      filename: a.filename,
      content: a.content.toString("base64"),
      ...(a.contentType ? { content_type: a.contentType } : {}),
    }));
  }
  return payload;
}

export async function sendViaResend(
  email: OutboundEmail & { from: string; messageId: string },
  options: { apiKey: string; fetchImpl?: typeof fetch; baseUrl?: string }
): Promise<SendMailResult> {
  const doFetch = options.fetchImpl ?? fetch;
  const response = await doFetch(`${options.baseUrl ?? "https://api.resend.com"}/emails`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildResendPayload(email)),
  });
  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as { message?: string; name?: string };
      detail = body.message ?? body.name ?? "";
    } catch {
      /* non-JSON error body */
    }
    throw new Error(`Resend rejected the email (HTTP ${response.status})${detail ? `: ${detail}` : ""}`);
  }
  const body = (await response.json()) as { id?: string };
  return { provider: "resend", messageId: email.messageId, providerId: body.id };
}

export async function sendViaSmtp(
  email: OutboundEmail & { from: string; messageId: string },
  transport: Transporter
): Promise<SendMailResult> {
  const info = await transport.sendMail({
    from: email.from,
    to: email.to,
    cc: email.cc,
    replyTo: email.replyTo,
    subject: email.subject,
    text: email.text,
    html: email.html,
    headers: email.headers,
    messageId: email.messageId,
    inReplyTo: email.inReplyTo,
    references: email.references,
    attachments: email.attachments,
  });
  return { provider: "smtp", messageId: info.messageId || email.messageId };
}

export type SendMailOptions = {
  /** Override the provider (the correspondence sender uses its own SMTP account). */
  provider?: EmailProvider;
  /** SMTP transport to use instead of the shared notification transport. */
  transport?: Transporter;
  env?: Env;
};

/** Send one email through the configured provider. Resolves to the Message-ID used. */
export async function sendMail(email: OutboundEmail, options: SendMailOptions = {}): Promise<SendMailResult> {
  const env = options.env ?? process.env;
  const from = email.from ?? defaultFromAddress(env);
  const prepared = { ...email, from, messageId: email.messageId ?? newMessageId(from) };
  const provider = options.provider ?? resolveEmailProvider(env);

  if (provider === "resend") {
    const apiKey = env.RESEND_API_KEY?.trim();
    if (!apiKey) throw new Error("RESEND_API_KEY is not set.");
    return sendViaResend(prepared, { apiKey });
  }

  const transport = options.transport ?? (await import("./transport")).transport;
  return sendViaSmtp(prepared, transport);
}
