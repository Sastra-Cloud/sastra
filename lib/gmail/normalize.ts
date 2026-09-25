import type { AddressObject, Attachment, ParsedMail } from "mailparser";

import type { NormalizedAddress, NormalizedMessage } from "./types";

function toAddresses(
  field: AddressObject | AddressObject[] | undefined
): NormalizedAddress[] {
  if (!field) return [];
  const objs = Array.isArray(field) ? field : [field];
  const out: NormalizedAddress[] = [];
  for (const o of objs) {
    for (const a of o.value ?? []) {
      if (a.address) {
        out.push({
          email: a.address.toLowerCase(),
          ...(a.name ? { name: a.name } : {}),
        });
      }
    }
  }
  return out;
}

function refList(references: string | string[] | undefined): string[] {
  if (!references) return [];
  return Array.isArray(references)
    ? references
    : references.split(/\s+/).filter(Boolean);
}

/** Map a mailparser result into our transport-agnostic normalized shape. */
export function normalizeParsed(
  mail: ParsedMail,
  options: { providerThreadId?: string | null } = {}
): NormalizedMessage {
  const messageId = (mail.messageId ?? "").trim();
  const refs = refList(mail.references);
  const inReplyTo = mail.inReplyTo?.trim() || null;
  // Root of the conversation: first Reference, else In-Reply-To, else this id.
  const threadKey = refs[0] ?? inReplyTo ?? messageId;

  const attachments = (mail.attachments ?? [])
    .filter((a: Attachment) => a.content)
    .map((a: Attachment) => ({
      filename: a.filename || "attachment",
      mimeType: a.contentType || "application/octet-stream",
      size: a.size ?? a.content.length,
      content: a.content as Buffer,
    }));

  return {
    messageId,
    threadKey: threadKey || messageId,
    providerThreadId: options.providerThreadId?.trim() || null,
    inReplyTo,
    references: refs.length ? refs.join(" ") : null,
    from: toAddresses(mail.from)[0] ?? null,
    to: toAddresses(mail.to),
    cc: toAddresses(mail.cc),
    subject: mail.subject ?? null,
    text: mail.text ?? null,
    html: typeof mail.html === "string" ? mail.html : null,
    date: mail.date ?? null,
    attachments,
  };
}
