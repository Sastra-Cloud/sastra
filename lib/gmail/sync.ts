import "server-only";

import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { and, desc, eq, ilike, inArray, isNull } from "drizzle-orm";

import { runAfterResponse } from "@/lib/after-response";
import { db } from "@/lib/db";
import {
  emailMessages,
  emailThreads,
  fileAttachments,
  files,
  gmailAccounts,
  printThreadLinks,
} from "@/lib/db/schema";
import {
  buildKey,
  getObjectBuffer,
  isAllowedMime,
  MAX_FILE_BYTES,
  putObject,
} from "@/lib/r2";
import { getCaptureMailbox, getCorrespondenceAddress, isGmailCaptureEnabled } from "./config";
import { extractForwardedHeaderHints } from "./forwarded";
import {
  fetchMessageByMessageId,
  fetchNewMessages,
  type ImapCursor,
} from "./imap";
import {
  attributeUserByEmail,
  resolveThreadLink,
  type ThreadLink,
} from "./link";
import {
  MAX_RAW_MESSAGE_BYTES,
  parseRawMessage,
  rawMessageObjectKey,
  resolveMessageId,
  type IngestSource,
} from "./raw";
import type { NormalizedAttachment, NormalizedMessage } from "./types";
import { linkPrintThread } from "@/lib/print/email-link";
import {
  createRunFromTextQuote,
  parsedTextQuotes,
} from "@/lib/print/email-text-quote";
import { runTextQuoteExtraction } from "@/lib/print/email-text-extract";
import { ensureThreadProjectLink } from "@/lib/email/thread-projects";
import { extractPrintInvoice } from "@/lib/print/extract";
import { looksLikePrintFinanceFile } from "@/lib/print/finance-attachment";
import { reviewPossibleNewProject } from "@/lib/email/project-signal";
import {
  ensurePrintProofTaskSuggestion,
  reviewForwardedEmailTasks,
} from "@/lib/email/task-suggestions";
import {
  reconcileFollowUpForMessage,
  refreshFollowUpSummary,
  resolveRelatedPrintFollowUps,
} from "@/lib/email/follow-ups";
import {
  enqueueEmailRightsReviewsForThread,
  processEmailRightsReviews,
} from "@/lib/email/rights-review";
import { latestReplyText } from "@/lib/email/follow-up-policy";
import {
  looksLikePrintProofAttachment,
  PRINT_PROOF_ATTACHMENT_LABEL,
} from "@/lib/print/proof-attachment";
import { advancePrintRunStatus } from "@/lib/print/run-status";
import { ensurePrintProofProjectUpdateSuggestion } from "@/lib/email/project-update-suggestions";

/**
 * Upper size bound for auto-extracting an invoice PDF. Real printer invoices are
 * ~135 KB; print-ready proofs are tens of MB, so this keeps a mis-named proof
 * (e.g. "Final proof.pdf") from triggering an AI extraction.
 */
const PRINT_INVOICE_EXTRACT_MAX_BYTES = 8 * 1024 * 1024;

/** One newly-ingested message, surfaced so callers can notify / react. */
export type IngestEvent = {
  threadRowId: string;
  direction: "inbound" | "outbound";
  fromAddr: string | null;
  subject: string | null;
  projectId: string | null;
  attributedUserId: string | null;
};

type CaptureAccount = { id: string; mailbox: string; cursor: ImapCursor };

/** Cursor is stored as "uidValidity:lastUid" in gmail_accounts.historyId. */
function parseCursor(raw: string | null): ImapCursor {
  if (!raw) return { uidValidity: null, lastUid: 0 };
  const [uidValidity, lastUid] = raw.split(":");
  return { uidValidity: uidValidity || null, lastUid: Number(lastUid) || 0 };
}

async function ensureCaptureAccount(): Promise<CaptureAccount | null> {
  const mailbox = (await getCaptureMailbox());
  if (!mailbox) return null;
  await db
    .insert(gmailAccounts)
    .values({ mailbox, connectionType: "imap" })
    .onConflictDoNothing({ target: gmailAccounts.mailbox });
  const [row] = await db
    .select({
      id: gmailAccounts.id,
      mailbox: gmailAccounts.mailbox,
      historyId: gmailAccounts.historyId,
    })
    .from(gmailAccounts)
    .where(eq(gmailAccounts.mailbox, mailbox))
    .limit(1);
  return row
    ? { id: row.id, mailbox: row.mailbox, cursor: parseCursor(row.historyId) }
    : null;
}

async function upsertThread(
  mailbox: string,
  msg: Pick<
    NormalizedMessage,
    | "messageId"
    | "threadKey"
    | "providerThreadId"
    | "inReplyTo"
    | "references"
    | "subject"
    | "date"
  >,
  link: ThreadLink,
  direction: "inbound" | "outbound",
  attributedUserId: string | null
): Promise<{ id: string; projectId: string | null }> {
  const providerMatch = msg.providerThreadId
    ? await db
        .select()
        .from(emailThreads)
        .where(
          and(
            eq(emailThreads.mailbox, mailbox),
            eq(emailThreads.providerThreadId, msg.providerThreadId)
          )
        )
        .limit(1)
        .then((rows) => rows[0] ?? null)
    : null;
  const legacyMatch = providerMatch
    ? null
    : await db
        .select()
        .from(emailThreads)
        .where(eq(emailThreads.gmailThreadId, msg.threadKey))
        .limit(1)
        .then((rows) => rows[0] ?? null);
  const parentIds = [
    ...(msg.references?.split(/\s+/).filter(Boolean) ?? []),
    msg.inReplyTo,
  ].filter((value): value is string => !!value && value !== msg.messageId);
  const parentMatch = providerMatch || legacyMatch || !parentIds.length
    ? null
    : await db
        .select({ threadId: emailMessages.threadId })
        .from(emailMessages)
        .where(inArray(emailMessages.messageIdHeader, [...new Set(parentIds)]))
        .limit(1)
        .then(async (rows) => {
          const threadId = rows[0]?.threadId;
          if (!threadId) return null;
          return db
            .select()
            .from(emailThreads)
            .where(eq(emailThreads.id, threadId))
            .limit(1)
            .then((threads) => threads[0] ?? null);
        });
  const existing = providerMatch ?? legacyMatch ?? parentMatch;

  if (existing) {
    const patch: Partial<typeof emailThreads.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (!existing.providerThreadId && msg.providerThreadId) {
      patch.providerThreadId = msg.providerThreadId;
    }
    if (msg.date && (!existing.lastMessageAt || msg.date > existing.lastMessageAt)) {
      patch.lastMessageAt = msg.date;
      patch.lastDirection = direction;
    }
    if (!existing.linkedManually) {
      if (!existing.projectId && link.projectId) patch.projectId = link.projectId;
      if (!existing.holderId && link.holderId) patch.holderId = link.holderId;
      if (!existing.contactId && link.contactId) patch.contactId = link.contactId;
      if (!existing.partnerId && link.partnerId) patch.partnerId = link.partnerId;
      if (!existing.partnerContactId && link.partnerContactId) {
        patch.partnerContactId = link.partnerContactId;
      }
    }
    if (!existing.ownerUserId && direction === "outbound" && attributedUserId) {
      patch.ownerUserId = attributedUserId;
    }
    await db.update(emailThreads).set(patch).where(eq(emailThreads.id, existing.id));
    // Mirror a newly auto-assigned primary into the many-to-many join table.
    if (patch.projectId) {
      await ensureThreadProjectLink(db, existing.id, patch.projectId);
    }
    return { id: existing.id, projectId: existing.projectId ?? patch.projectId ?? null };
  }

  const [created] = await db
    .insert(emailThreads)
    .values({
      gmailThreadId: msg.threadKey,
      providerThreadId: msg.providerThreadId,
      mailbox,
      subject: msg.subject,
      status: "open",
      lastMessageAt: msg.date,
      lastDirection: direction,
      ownerUserId: direction === "outbound" ? attributedUserId : null,
      projectId: link.projectId,
      holderId: link.holderId,
      contactId: link.contactId,
      partnerId: link.partnerId,
      partnerContactId: link.partnerContactId,
    })
    .onConflictDoNothing({ target: emailThreads.gmailThreadId })
    .returning({ id: emailThreads.id, projectId: emailThreads.projectId });
  if (created) {
    if (created.projectId) {
      await ensureThreadProjectLink(db, created.id, created.projectId);
    }
    return { id: created.id, projectId: created.projectId };
  }

  const [row] = await db
    .select({ id: emailThreads.id, projectId: emailThreads.projectId })
    .from(emailThreads)
    .where(eq(emailThreads.gmailThreadId, msg.threadKey))
    .limit(1);
  if (row?.projectId) await ensureThreadProjectLink(db, row.id, row.projectId);
  return { id: row!.id, projectId: row!.projectId };
}

async function storeAttachment(
  messageRowId: string,
  att: NormalizedAttachment,
  label?: string
): Promise<string | null> {
  if (!isAllowedMime(att.mimeType)) return null;
  const bytes = att.content;
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_FILE_BYTES) return null;

  const fileId = randomUUID();
  const key = buildKey(fileId, att.filename);
  await putObject(key, bytes, att.mimeType);
  await db.insert(files).values({
    id: fileId,
    r2Key: key,
    originalName: att.filename,
    mimeType: att.mimeType,
    sizeBytes: bytes.byteLength,
    status: "ready",
  });
  await db.insert(fileAttachments).values({
    fileId,
    targetType: "email_message",
    targetId: messageRowId,
    label,
  });
  return fileId;
}

type PrintAttachmentContext = {
  isPrintLinked: boolean;
  newestBodyText: string | null;
};

function isProofAttachment(
  attachment: NormalizedAttachment,
  context: PrintAttachmentContext
) {
  return (
    context.isPrintLinked &&
    looksLikePrintProofAttachment({
      fileName: attachment.filename,
      mimeType: attachment.mimeType,
      newestBodyText: context.newestBodyText,
    })
  );
}

async function existingAttachmentKeys(messageRowId: string) {
  const rows = await db
    .select({ originalName: files.originalName, sizeBytes: files.sizeBytes })
    .from(fileAttachments)
    .innerJoin(files, eq(files.id, fileAttachments.fileId))
    .where(
      and(
        eq(fileAttachments.targetType, "email_message"),
        eq(fileAttachments.targetId, messageRowId)
      )
    );
  return new Set(rows.map((row) => `${row.originalName}\u0000${row.sizeBytes}`));
}

/**
 * Load a captured message's full content again: the retained `.eml` in
 * storage first, then the Gmail mailbox over IMAP for messages captured before
 * raw retention (or whose upload failed). Null when neither has it.
 */
export async function loadRawMessage(
  messageId: string
): Promise<NormalizedMessage | null> {
  const normalizedId = messageId.trim();
  if (!normalizedId) return null;
  const [row] = await db
    .select({
      rawObjectKey: emailMessages.rawObjectKey,
      providerThreadId: emailMessages.providerThreadId,
    })
    .from(emailMessages)
    .where(eq(emailMessages.messageIdHeader, normalizedId))
    .limit(1);
  if (row?.rawObjectKey) {
    try {
      const raw = await getObjectBuffer(row.rawObjectKey, {
        maxBytes: MAX_RAW_MESSAGE_BYTES,
      });
      if (raw.byteLength) {
        return parseRawMessage(raw, { providerThreadId: row.providerThreadId });
      }
    } catch (err) {
      console.error("stored raw email read failed:", row.rawObjectKey, err);
    }
  }
  if (!(await isGmailCaptureEnabled())) return null;
  const fetched = await fetchMessageByMessageId(normalizedId);
  return fetched
    ? parseRawMessage(fetched.source, { providerThreadId: fetched.providerThreadId })
    : null;
}

/**
 * Re-read a stored email (retained `.eml`, else IMAP) and fill in attachments
 * omitted by an older ingestion version. Idempotent by message + original
 * filename + byte size.
 */
export async function syncStoredMessageAttachments(input: {
  messageRowId: string;
  messageIdHeader: string | null;
  bodyText: string | null;
  isPrintLinked: boolean;
  runId: string | null;
}): Promise<{ stored: number; proofsStored: number }> {
  if (!input.messageIdHeader) return { stored: 0, proofsStored: 0 };
  const message = await loadRawMessage(input.messageIdHeader);
  if (!message?.attachments.length) return { stored: 0, proofsStored: 0 };

  const existing = await existingAttachmentKeys(input.messageRowId);
  const context: PrintAttachmentContext = {
    isPrintLinked: input.isPrintLinked,
    newestBodyText: latestReplyText(input.bodyText),
  };
  let stored = 0;
  let proofsStored = 0;
  for (const attachment of message.attachments) {
    const key = `${attachment.filename}\u0000${attachment.content.byteLength}`;
    if (existing.has(key)) continue;
    const proof = isProofAttachment(attachment, context);
    const fileId = await storeAttachment(
      input.messageRowId,
      attachment,
      proof ? PRINT_PROOF_ATTACHMENT_LABEL : undefined
    );
    if (!fileId) continue;
    existing.add(key);
    stored += 1;
    if (proof) proofsStored += 1;
  }
  if (proofsStored && input.runId) {
    await advancePrintRunStatus(input.runId, "proofing");
  }
  return { stored, proofsStored };
}

/**
 * Whether a PDF on a print-linked thread should be auto-extracted as a
 * quote/invoice. Delegates the filename heuristic to the shared classifier (also
 * used by the manager reprocess path) so covers, bleeds, and book interiors are
 * not mistaken for finance docs. A size cap at the call site keeps large proofs
 * out, and everything lands as a `suggested` quote for manager review.
 */
function isPrintFinanceAttachment(att: NormalizedAttachment): boolean {
  if (att.mimeType !== "application/pdf") return false;
  return looksLikePrintFinanceFile(att.filename);
}

/**
 * Link, attribute, and idempotently store one normalized message. Direction and
 * attribution can be forced (used when recording an app-sent outbound message).
 */
async function ingestNormalized(
  mailbox: string,
  msg: NormalizedMessage,
  opts?: {
    direction?: "inbound" | "outbound";
    attributedUserId?: string | null;
    /** Storage key of the retained original `.eml`, when one was stored. */
    rawObjectKey?: string | null;
  }
): Promise<IngestEvent | null> {
  // Some forwarded/list mail has no Message-ID. Synthesize a stable one from the
  // content rather than dropping the message; dedup still holds across polls.
  const messageId = resolveMessageId(msg);
  const threadKey = msg.threadKey || messageId;

  const forwarded = extractForwardedHeaderHints({
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
  });
  const envelopeUserId = await attributeUserByEmail(msg.from?.email);
  let attributedUserId = opts?.attributedUserId ?? null;
  let direction = opts?.direction;
  if (forwarded.isForwarded && !opts?.attributedUserId) {
    const originalFromUserId = forwarded.fromEmails[0]
      ? await attributeUserByEmail(forwarded.fromEmails[0])
      : null;
    attributedUserId = originalFromUserId;
    direction ??= originalFromUserId ? "outbound" : "inbound";
  } else if (!opts?.attributedUserId) {
    attributedUserId = envelopeUserId;
  }
  direction ??= attributedUserId ? "outbound" : "inbound";
  const participants = [
    msg.from?.email,
    ...msg.to.map((a) => a.email),
    ...msg.cc.map((a) => a.email),
    ...forwarded.emails,
  ].filter((e): e is string => !!e);
  const includeQuotedHistory = forwarded.isForwarded;
  const link = await resolveThreadLink(participants, {
    subject: msg.subject,
    bodyText: msg.text,
    includeQuotedHistory,
  });

  const thread = await upsertThread(
    mailbox,
    { ...msg, messageId, threadKey },
    link,
    direction,
    attributedUserId
  );

  const [inserted] = await db
    .insert(emailMessages)
    .values({
      threadId: thread.id,
      gmailMessageId: messageId,
      direction,
      fromAddr: msg.from?.email ?? null,
      toAddrs: msg.to.map((a) => a.email),
      ccAddrs: msg.cc.map((a) => a.email),
      subject: msg.subject,
      messageIdHeader: messageId,
      inReplyToHeader: msg.inReplyTo,
      referenceHeaders: msg.references?.split(/\s+/).filter(Boolean) ?? [],
      providerThreadId: msg.providerThreadId,
      snippet: (msg.text ?? "").slice(0, 200) || null,
      bodyText: msg.text,
      bodyHtml: msg.html,
      attributedUserId,
      forwardedByUserId: forwarded.isForwarded ? envelopeUserId : null,
      forwarderNote: forwarded.isForwarded ? forwarded.forwarderNote : null,
      rawObjectKey: opts?.rawObjectKey ?? null,
      sentAt: msg.date,
    })
    .onConflictDoNothing({ target: emailMessages.gmailMessageId })
    .returning({ id: emailMessages.id });

  if (!inserted) return null; // already ingested

  // A deliberate internal forward can contain a concrete next action even when
  // specialized print, rights, or project extraction also applies. The
  // authenticated envelope sender owns the suggestion; original forwarded
  // participants remain untrusted evidence and never control assignment.
  if (forwarded.isForwarded && envelopeUserId) {
    const taskJob = {
      threadId: thread.id,
      messageId: inserted.id,
      forwarderUserId: envelopeUserId,
      forwarderNote: forwarded.forwarderNote,
      subject: msg.subject,
      originalSender: forwarded.fromEmails[0] ?? msg.from?.email ?? null,
      bodyText: msg.text,
      bodyHtml: msg.html,
      forwardedAt: msg.date,
      originalDate: forwarded.originalDate,
    };
    try {
      after(() =>
        reviewForwardedEmailTasks(taskJob).catch((err) =>
          console.error("forwarded email task review failed:", err)
        )
      );
    } catch {
      await reviewForwardedEmailTasks(taskJob).catch((err) =>
        console.error("forwarded email task review failed:", err)
      );
    }
  }

  const printLink = await linkPrintThread({
    threadId: thread.id,
    participantEmails: participants,
    participantNames: forwarded.names,
    subject: msg.subject,
    bodyText: msg.text,
    includeQuotedHistory,
    existingProjectId: thread.projectId,
  });
  const parsedQuotes = parsedTextQuotes(msg.text, { includeQuotedHistory });
  let printRunId = printLink?.runId ?? null;
  const printProjectId = printLink?.projectId ?? thread.projectId ?? link.projectId;
  if (!printRunId && printProjectId && parsedQuotes.length) {
    printRunId = await createRunFromTextQuote({
      projectId: printProjectId,
      contactId: printLink?.contactId ?? link.contactId ?? null,
      parsedQuotes,
      actorUserId: attributedUserId,
    });
    if (printRunId) {
      await linkPrintThread({
        threadId: thread.id,
        participantEmails: participants,
        participantNames: forwarded.names,
        subject: msg.subject,
        bodyText: msg.text,
        includeQuotedHistory,
        existingProjectId: printProjectId,
        runId: printRunId,
      });
    }
  }
  if (printRunId && printProjectId && parsedQuotes.length) {
    // AI-first extraction (cross-checked against the regex parser) runs detached
    // so ingestion isn't blocked on the model; falls back to regex on failure.
    const textJob = {
      bodyText: msg.text,
      includeQuotedHistory,
      projectId: printProjectId,
      runId: printRunId,
      sourceThreadId: thread.id,
      sourceMessageId: inserted.id,
      actorUserId: attributedUserId,
    };
    try {
      after(() =>
        runTextQuoteExtraction(textJob).catch((err) =>
          console.error("print text-quote extract failed:", err)
        )
      );
    } catch {
      await runTextQuoteExtraction(textJob).catch((err) =>
        console.error("print text-quote extract failed:", err)
      );
    }
  }

  const printAttachmentContext: PrintAttachmentContext = {
    isPrintLinked: !!(printLink || printRunId),
    newestBodyText: latestReplyText(msg.text),
  };
  let proofStored = false;
  for (const att of msg.attachments) {
    try {
      const proof = isProofAttachment(att, printAttachmentContext);
      const fileId = await storeAttachment(
        inserted.id,
        att,
        proof ? PRINT_PROOF_ATTACHMENT_LABEL : undefined
      );
      if (fileId && proof && printRunId) {
        await advancePrintRunStatus(printRunId, "proofing");
      }
      if (fileId && proof) proofStored = true;
      // A finance PDF on a matched run → auto-extract it into a suggested quote
      // for review. Runs after the response so ingestion isn't blocked on AI.
      if (
        fileId &&
        printRunId &&
        !proof &&
        isPrintFinanceAttachment(att) &&
        att.content.byteLength <= PRINT_INVOICE_EXTRACT_MAX_BYTES
      ) {
        const job = {
          fileId,
          runId: printRunId,
          sourceThreadId: thread.id,
          sourceMessageId: inserted.id,
        };
        try {
          after(() =>
            extractPrintInvoice(job).catch((err) =>
              console.error("print invoice extract failed:", err)
            )
          );
        } catch {
          // Outside a request context (e.g. a script) — extract inline.
          await extractPrintInvoice(job).catch((err) =>
            console.error("print invoice extract failed:", err)
          );
        }
      }
    } catch (err) {
      console.error("gmail attachment store failed:", att.filename, err);
    }
  }
  if (proofStored && printProjectId) {
    await ensurePrintProofProjectUpdateSuggestion({
      threadId: thread.id,
      messageId: inserted.id,
      projectId: printProjectId,
      bodyText: msg.text,
    }).catch((error) =>
      console.error("print proof project-update suggestion failed:", error)
    );
    if (direction === "inbound" && !forwarded.isForwarded) {
      await ensurePrintProofTaskSuggestion({
        threadId: thread.id,
        messageId: inserted.id,
        projectId: printProjectId,
        toAddrs: msg.to.map((address) => address.email),
        sourceSender: msg.from?.email ?? null,
        sourceSubject: msg.subject,
        sourceSentAt: msg.date,
        bodyText: msg.text,
      }).catch((error) =>
        console.error("print proof task suggestion failed:", error)
      );
    }
  }

  if (direction === "inbound") {
    const job = {
      threadId: thread.id,
      fromAddr: msg.from?.email ?? null,
      subject: msg.subject,
      bodyText: msg.text,
      includeQuotedHistory: forwarded.isForwarded,
    };
    try {
      after(() =>
        reviewPossibleNewProject(job).catch((err) =>
          console.error("email project-signal review failed:", err)
        )
      );
    } catch {
      await reviewPossibleNewProject(job).catch((err) =>
        console.error("email project-signal review failed:", err)
      );
    }
  }

  const finalProjectId =
    thread.projectId ?? printLink?.projectId ?? printProjectId ?? null;
  if (finalProjectId) {
    const rightsReviewIds = await enqueueEmailRightsReviewsForThread(thread.id, [
      finalProjectId,
    ]);
    if (rightsReviewIds.length) {
      const rightsJob = () =>
        processEmailRightsReviews(rightsReviewIds).catch((err) =>
          console.error("email rights-document review failed:", err)
        );
      try {
        after(rightsJob);
      } catch {
        await rightsJob();
      }
    }
  }
  const followUp = await reconcileFollowUpForMessage({
    threadId: thread.id,
    messageId: inserted.id,
    direction,
    sentAt: msg.date,
    subject: msg.subject,
    bodyText: msg.text,
    recipients: msg.to.map((address) => address.email).filter(Boolean),
    attributedUserId,
    projectLinked: !!finalProjectId,
  });
  if (direction === "inbound" && printRunId) {
    await resolveRelatedPrintFollowUps({
      inboundThreadId: thread.id,
      runId: printRunId,
      repliedAt: msg.date ?? new Date(),
    });
  }
  if (followUp.followUpId && followUp.shouldSummarize) {
    const followUpId = followUp.followUpId;
    runAfterResponse("follow-up summary refresh", () =>
      refreshFollowUpSummary(followUpId)
    );
  }

  return {
    threadRowId: thread.id,
    direction,
    fromAddr: msg.from?.email ?? null,
    subject: msg.subject,
    projectId: finalProjectId,
    attributedUserId,
  };
}

/**
 * Record an email we just sent via SMTP into the same thread/message tables
 * (SMTP sends land in the mailbox's Sent, not INBOX, so the poller won't see
 * them). Attributed to the acting user so they own the thread.
 */
export async function recordOutbound(input: {
  messageId: string;
  threadKey: string;
  inReplyTo: string | null;
  references: string | null;
  to: string[];
  cc: string[];
  subject: string;
  bodyText: string;
  actingUserId: string | null;
}): Promise<void> {
  const mailbox = (await getCaptureMailbox());
  if (!mailbox) return;
  const msg: NormalizedMessage = {
    messageId: input.messageId,
    threadKey: input.threadKey,
    providerThreadId: null,
    inReplyTo: input.inReplyTo,
    references: input.references,
    from: { email: mailbox },
    to: input.to.map((email) => ({ email })),
    cc: input.cc.map((email) => ({ email })),
    subject: input.subject,
    text: input.bodyText,
    html: null,
    date: new Date(),
    attachments: [],
  };
  await ingestNormalized(mailbox, msg, {
    direction: "outbound",
    attributedUserId: input.actingUserId,
  });
}

/**
 * Repair recent proof-delivery emails captured before print attachments were
 * retained. Bounded and idempotent so the regular mailbox cron can safely run it.
 */
export async function syncRecentPrintProofAttachments(limit = 5) {
  const rows = await db
    .select({
      messageRowId: emailMessages.id,
      messageIdHeader: emailMessages.messageIdHeader,
      bodyText: emailMessages.bodyText,
      fromAddr: emailMessages.fromAddr,
      toAddrs: emailMessages.toAddrs,
      subject: emailMessages.subject,
      sentAt: emailMessages.sentAt,
      threadId: emailMessages.threadId,
      runId: printThreadLinks.runId,
      projectId: printThreadLinks.projectId,
    })
    .from(emailMessages)
    .innerJoin(
      printThreadLinks,
      eq(printThreadLinks.threadId, emailMessages.threadId)
    )
    .leftJoin(
      fileAttachments,
      and(
        eq(fileAttachments.targetType, "email_message"),
        eq(fileAttachments.targetId, emailMessages.id),
        eq(fileAttachments.label, PRINT_PROOF_ATTACHMENT_LABEL)
      )
    )
    .where(
      and(
        eq(emailMessages.direction, "inbound"),
        ilike(emailMessages.bodyText, "%proof%"),
        ilike(emailMessages.bodyText, "%attach%"),
        isNull(fileAttachments.id)
      )
    )
    .orderBy(desc(emailMessages.sentAt), desc(emailMessages.createdAt))
    .limit(Math.max(1, Math.min(25, limit)));

  let stored = 0;
  let proofsStored = 0;
  let followUpsResolved = 0;
  for (const row of rows) {
    const result = await syncStoredMessageAttachments({
      messageRowId: row.messageRowId,
      messageIdHeader: row.messageIdHeader,
      bodyText: row.bodyText,
      isPrintLinked: true,
      runId: row.runId,
    }).catch((error) => {
      console.error("print proof attachment repair failed:", row.messageRowId, error);
      return { stored: 0, proofsStored: 0 };
    });
    stored += result.stored;
    proofsStored += result.proofsStored;
    if (result.proofsStored && row.runId) {
      followUpsResolved += await resolveRelatedPrintFollowUps({
        inboundThreadId: row.threadId,
        runId: row.runId,
        repliedAt: row.sentAt ?? new Date(),
      });
    }
    if (result.proofsStored && row.projectId) {
      await ensurePrintProofProjectUpdateSuggestion({
        threadId: row.threadId,
        messageId: row.messageRowId,
        projectId: row.projectId,
        bodyText: row.bodyText,
      }).catch((error) =>
        console.error("repaired proof project-update suggestion failed:", error)
      );
      const forwarded = extractForwardedHeaderHints({
        subject: row.subject,
        text: row.bodyText,
      });
      if (!forwarded.isForwarded) {
        await ensurePrintProofTaskSuggestion({
          threadId: row.threadId,
          messageId: row.messageRowId,
          projectId: row.projectId,
          toAddrs: row.toAddrs,
          sourceSender: row.fromAddr,
          sourceSubject: row.subject,
          sourceSentAt: row.sentAt,
          bodyText: row.bodyText,
        }).catch((error) =>
          console.error("repaired proof task suggestion failed:", error)
        );
      }
    }
  }
  return { checked: rows.length, stored, proofsStored, followUpsResolved };
}

export type RawIngestResult =
  | { status: "ingested"; messageId: string; event: IngestEvent }
  | { status: "duplicate"; messageId: string };

/** Keep the original `.eml` under its stable key; ingestion proceeds without it on failure. */
async function storeRawMessage(messageId: string, raw: Buffer): Promise<string | null> {
  const key = rawMessageObjectKey(messageId);
  try {
    await putObject(key, raw, "message/rfc822");
    return key;
  } catch (err) {
    console.error("raw email store failed:", messageId, err);
    return null;
  }
}

/**
 * The one ingest pipeline for every transport: parse one RFC 822 message,
 * dedupe on its Message-ID, retain the original `.eml` in storage, then link,
 * attribute, and store it exactly as the IMAP poller always has. Returns the
 * same `IngestEvent` the poller reports, or `duplicate` when the Message-ID is
 * already captured.
 */
export async function ingestRawMessage(
  raw: Buffer | string,
  opts: {
    source: IngestSource;
    providerThreadId?: string | null;
    /** Mailbox the message was captured for; defaults to the correspondence address. */
    mailbox?: string | null;
  }
): Promise<RawIngestResult> {
  const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  const msg = await parseRawMessage(buffer, {
    providerThreadId: opts.providerThreadId ?? null,
  });
  const messageId = resolveMessageId(msg);

  const [existing] = await db
    .select({ id: emailMessages.id })
    .from(emailMessages)
    .where(eq(emailMessages.gmailMessageId, messageId))
    .limit(1);
  if (existing) return { status: "duplicate", messageId };

  // Webhook deliveries carry no mailbox of their own; the correspondence
  // address (or the recipient) scopes provider thread ids the same way the
  // IMAP account does.
  const mailbox =
    opts.mailbox?.trim().toLowerCase() ||
    (await getCorrespondenceAddress()) ||
    msg.to[0]?.email ||
    "inbound";
  const rawObjectKey = await storeRawMessage(messageId, buffer);
  const event = await ingestNormalized(
    mailbox,
    { ...msg, messageId },
    { rawObjectKey }
  );
  if (!event) return { status: "duplicate", messageId }; // lost a concurrent race
  return { status: "ingested", messageId, event };
}

/** Poll the capture mailbox over IMAP and ingest new messages. */
export async function runCaptureSync(): Promise<IngestEvent[]> {
  const account = await ensureCaptureAccount();
  if (!account) return [];

  const { messages, uidValidity, lastUid } = await fetchNewMessages(account.cursor);

  const events: IngestEvent[] = [];
  for (const msg of messages) {
    try {
      const result = await ingestRawMessage(msg.source, {
        source: "imap",
        providerThreadId: msg.providerThreadId,
        mailbox: account.mailbox,
      });
      if (result.status === "ingested") events.push(result.event);
    } catch (err) {
      console.error("gmail ingest failed for uid", msg.uid, err);
    }
  }

  await db
    .update(gmailAccounts)
    .set({
      historyId: `${uidValidity}:${lastUid}`,
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(gmailAccounts.id, account.id));

  return events;
}
