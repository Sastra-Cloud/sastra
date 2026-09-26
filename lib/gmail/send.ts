import "server-only";

import { createHash } from "node:crypto";
import nodemailer from "nodemailer";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { emailMessages, emailThreads } from "@/lib/db/schema";
import { sendMail } from "@/lib/email/send";

import {
  canSendAsCorrespondenceAddress,
  getCorrespondenceAddress,
  getMailboxConfig,
  type MailboxConfig,
} from "./config";
import { recordOutbound } from "./sync";
import { buildReferencesHeader } from "./message-id";

export type SendEmailInput = {
  to: string[];
  cc?: string[];
  subject: string;
  bodyText: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType: string;
  }>;
  /** RFC Message-ID being replied to (threads the reply). */
  inReplyTo?: string | null;
  /** Existing References chain to preserve. */
  references?: string | null;
  /** Reuse an existing thread's grouping key (for replies). */
  threadKey?: string | null;
  /** App user to attribute/own the sent thread. */
  actingUserId?: string | null;
  /** Stable application key; repeated calls return the already-recorded send. */
  idempotencyKey?: string;
};

export type SendEmailResult = { messageId: string; threadKey: string };

let cachedGmailTransport: { key: string; transport: nodemailer.Transporter } | null = null;

export function smtpTransportFor(config: Pick<MailboxConfig, "mailbox" | "appPassword" | "smtpHost" | "smtpPort">): nodemailer.Transporter {
  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465,
    auth: { user: config.mailbox, pass: config.appPassword },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
}

/** The Gmail mailbox's own SMTP, used when capture runs through Gmail. Rebuilt when the mailbox changes. */
function gmailTransport(config: MailboxConfig): nodemailer.Transporter {
  const key = `${config.mailbox}:${createHash("sha256").update(config.appPassword).digest("hex")}`;
  if (cachedGmailTransport?.key === key) return cachedGmailTransport.transport;
  cachedGmailTransport = { key, transport: smtpTransportFor(config) };
  return cachedGmailTransport.transport;
}

/**
 * Send an email as the workspace's correspondence address. With a Gmail
 * capture mailbox this goes through that mailbox's SMTP (Gmail files its own
 * Sent copy); otherwise it goes through the notification email provider with
 * `CORRESPONDENCE_ADDRESS` as the sender. Threading headers are set either way,
 * and the sent copy is recorded straight into our tables via recordOutbound,
 * attributed to the acting user.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const [mailbox, canSend, gmail] = await Promise.all([getCorrespondenceAddress(), canSendAsCorrespondenceAddress(), getMailboxConfig()]);
  if (!mailbox || !canSend) {
    throw new Error("The correspondence address isn't configured for sending.");
  }

  const domain = mailbox.split("@")[1] ?? "localhost";
  const deterministicMessageId = input.idempotencyKey
    ? `<sastra-${createHash("sha256")
        .update(input.idempotencyKey)
        .digest("hex")
        .slice(0, 32)}@${domain}>`
    : undefined;
  if (deterministicMessageId) {
    const [existing] = await db
      .select({ threadKey: emailThreads.gmailThreadId })
      .from(emailMessages)
      .innerJoin(emailThreads, eq(emailThreads.id, emailMessages.threadId))
      .where(eq(emailMessages.gmailMessageId, deterministicMessageId))
      .limit(1);
    if (existing) {
      return { messageId: deterministicMessageId, threadKey: existing.threadKey };
    }
  }

  const references =
    buildReferencesHeader(input.references, input.inReplyTo) ?? undefined;

  const sent = await sendMail(
    {
      from: mailbox,
      to: input.to,
      cc: input.cc,
      subject: input.subject,
      text: input.bodyText,
      attachments: input.attachments,
      inReplyTo: input.inReplyTo ?? undefined,
      references,
      messageId: deterministicMessageId,
    },
    gmail ? { provider: "smtp", transport: gmailTransport(gmail) } : {}
  );

  const messageId = sent.messageId;
  const threadKey = input.threadKey ?? messageId;

  await recordOutbound({
    messageId,
    threadKey,
    inReplyTo: input.inReplyTo ?? null,
    references: references ?? null,
    to: input.to,
    cc: input.cc ?? [],
    subject: input.subject,
    bodyText: input.bodyText,
    actingUserId: input.actingUserId ?? null,
  });

  return { messageId, threadKey };
}
