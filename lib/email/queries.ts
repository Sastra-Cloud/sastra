import "server-only";

import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/guards";
import {
  emailMessages,
  emailProjectSuggestions,
  emailThreadProjects,
  emailThreads,
  partners,
  projects,
  rightsHolders,
  fileAttachments,
  files,
} from "@/lib/db/schema";
import { buildReferencesHeader } from "@/lib/gmail/message-id";
import { emailMessagePreviewText } from "@/lib/email/message-preview";

export type ThreadStatus = "open" | "waiting" | "done";
export type EmailDirection = "inbound" | "outbound";
export type ProjectKind =
  | "book"
  | "article"
  | "podcast"
  | "video_series"
  | "other";

export type ThreadSummary = {
  id: string;
  subject: string | null;
  status: ThreadStatus;
  lastMessageAt: Date | null;
  lastDirection: EmailDirection | null;
  projectId: string | null;
  projectSlug: string | null;
  projectTitle: string | null;
  holderId: string | null;
  holderName: string | null;
  contactId: string | null;
  partnerId: string | null;
  partnerName: string | null;
  partnerContactId: string | null;
  ownerUserId: string | null;
  assigneeId: string | null;
  linkedManually: boolean;
};

export type ProjectThreadPreview = ThreadSummary & {
  previewText: string | null;
};

export type ThreadMessage = {
  id: string;
  direction: EmailDirection;
  fromAddr: string | null;
  toAddrs: string[] | null;
  ccAddrs: string[] | null;
  subject: string | null;
  snippet: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  messageIdHeader: string | null;
  attributedUserId: string | null;
  forwardedByUserId: string | null;
  forwarderNote: string | null;
  sentAt: Date | null;
  attachments: Array<{
    id: string;
    fileId: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  }>;
};

const summaryColumns = {
  id: emailThreads.id,
  subject: emailThreads.subject,
  status: emailThreads.status,
  lastMessageAt: emailThreads.lastMessageAt,
  lastDirection: emailThreads.lastDirection,
  projectId: emailThreads.projectId,
  projectSlug: projects.slug,
  projectTitle: projects.title,
  holderId: emailThreads.holderId,
  holderName: rightsHolders.name,
  contactId: emailThreads.contactId,
  partnerId: emailThreads.partnerId,
  partnerName: partners.name,
  partnerContactId: emailThreads.partnerContactId,
  ownerUserId: emailThreads.ownerUserId,
  assigneeId: emailThreads.assigneeId,
  linkedManually: emailThreads.linkedManually,
};

export type ListThreadsOptions = {
  projectId?: string;
  status?: ThreadStatus;
  /** Only threads not yet linked to a project (need a human to triage). */
  needsLinking?: boolean;
  /** `true` = project-linked threads, `false` = other/unlinked mailbox email. */
  projectRelated?: boolean;
  limit?: number;
};

export async function listThreads(
  opts: ListThreadsOptions = {}
): Promise<ThreadSummary[]> {
  // Correspondence is sensitive operational data. Keep the authorization at
  // the query boundary as well as on pages/tools so a future caller cannot
  // accidentally turn this into a member-readable data service.
  await requireRole("manager");
  const conds = [];
  if (opts.status) conds.push(eq(emailThreads.status, opts.status));
  if (opts.needsLinking) conds.push(isNull(emailThreads.projectId));
  if (opts.projectRelated === true) conds.push(isNotNull(emailThreads.projectId));
  if (opts.projectRelated === false) conds.push(isNull(emailThreads.projectId));

  let q = db
    .select(summaryColumns)
    .from(emailThreads)
    .leftJoin(projects, eq(projects.id, emailThreads.projectId))
    .leftJoin(rightsHolders, eq(rightsHolders.id, emailThreads.holderId))
    .leftJoin(partners, eq(partners.id, emailThreads.partnerId))
    .$dynamic();

  // A thread can be linked to several projects (many-to-many). When filtering by
  // project, match every link (not only the primary `projectId`) so the same
  // email surfaces under each project it concerns. The (thread, project) pair is
  // unique, so the inner join never duplicates a thread row.
  if (opts.projectId) {
    q = q.innerJoin(
      emailThreadProjects,
      and(
        eq(emailThreadProjects.threadId, emailThreads.id),
        eq(emailThreadProjects.projectId, opts.projectId)
      )
    );
  }

  return q
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(emailThreads.lastMessageAt))
    .limit(opts.limit ?? 50);
}

/** The newest linked threads plus a quote-free excerpt from each latest message. */
export async function listProjectThreadPreviews(
  projectId: string,
  limit = 3
): Promise<ProjectThreadPreview[]> {
  const threads = await listThreads({ projectId, limit });
  if (threads.length === 0) return [];

  const latestMessages = await db
    .selectDistinctOn([emailMessages.threadId], {
      threadId: emailMessages.threadId,
      subject: emailMessages.subject,
      snippet: emailMessages.snippet,
      bodyText: emailMessages.bodyText,
      bodyHtml: emailMessages.bodyHtml,
    })
    .from(emailMessages)
    .where(inArray(emailMessages.threadId, threads.map((thread) => thread.id)))
    .orderBy(
      emailMessages.threadId,
      sql`coalesce(${emailMessages.sentAt}, ${emailMessages.createdAt}) desc`
    );
  const previewByThread = new Map(
    latestMessages.map((message) => [
      message.threadId,
      emailMessagePreviewText(message),
    ])
  );

  return threads.map((thread) => ({
    ...thread,
    previewText: previewByThread.get(thread.id) ?? null,
  }));
}

export type ThreadProject = {
  id: string;
  slug: string;
  title: string;
  linkedManually: boolean;
};

/** Every project a thread is linked to (many-to-many), oldest link first. */
export async function listThreadProjects(
  threadId: string
): Promise<ThreadProject[]> {
  await requireRole("manager");
  return db
    .select({
      id: projects.id,
      slug: projects.slug,
      title: projects.title,
      linkedManually: emailThreadProjects.linkedManually,
    })
    .from(emailThreadProjects)
    .innerJoin(projects, eq(projects.id, emailThreadProjects.projectId))
    .where(eq(emailThreadProjects.threadId, threadId))
    .orderBy(emailThreadProjects.createdAt);
}

export type PendingProjectSuggestion = {
  id: string;
  title: string;
  kind: ProjectKind;
  videoProductionMode: "original" | "translation" | null;
  reason: string;
  confidence: number;
};

/**
 * AI-detected new-project candidates awaiting a manager's decision for a thread.
 * Read directly from `email_project_suggestions` (not from notification state),
 * so opening the notification never hides them.
 */
export async function listPendingProjectSuggestions(
  threadId: string
): Promise<PendingProjectSuggestion[]> {
  await requireRole("manager");
  const rows = await db
    .select({
      id: emailProjectSuggestions.id,
      title: emailProjectSuggestions.title,
      kind: emailProjectSuggestions.kind,
      videoProductionMode: emailProjectSuggestions.videoProductionMode,
      reason: emailProjectSuggestions.reason,
      confidence: emailProjectSuggestions.confidence,
    })
    .from(emailProjectSuggestions)
    .where(
      and(
        eq(emailProjectSuggestions.threadId, threadId),
        eq(emailProjectSuggestions.status, "pending")
      )
    )
    .orderBy(
      desc(emailProjectSuggestions.confidence),
      emailProjectSuggestions.createdAt
    );
  return rows.map((row) => ({ ...row, confidence: Number(row.confidence) }));
}

export async function getThread(
  threadId: string
): Promise<{ thread: ThreadSummary; messages: ThreadMessage[] } | null> {
  await requireRole("manager");
  const [thread] = await db
    .select(summaryColumns)
    .from(emailThreads)
    .leftJoin(projects, eq(projects.id, emailThreads.projectId))
    .leftJoin(rightsHolders, eq(rightsHolders.id, emailThreads.holderId))
    .leftJoin(partners, eq(partners.id, emailThreads.partnerId))
    .where(eq(emailThreads.id, threadId))
    .limit(1);
  if (!thread) return null;

  const messages = await db
    .select({
      id: emailMessages.id,
      direction: emailMessages.direction,
      fromAddr: emailMessages.fromAddr,
      toAddrs: emailMessages.toAddrs,
      ccAddrs: emailMessages.ccAddrs,
      subject: emailMessages.subject,
      snippet: emailMessages.snippet,
      bodyText: emailMessages.bodyText,
      bodyHtml: emailMessages.bodyHtml,
      messageIdHeader: emailMessages.messageIdHeader,
      attributedUserId: emailMessages.attributedUserId,
      forwardedByUserId: emailMessages.forwardedByUserId,
      forwarderNote: emailMessages.forwarderNote,
      sentAt: emailMessages.sentAt,
    })
    .from(emailMessages)
    .where(eq(emailMessages.threadId, threadId))
    .orderBy(emailMessages.sentAt);

  const attachments = messages.length
    ? await db
        .select({
          id: fileAttachments.id,
          messageId: fileAttachments.targetId,
          fileId: files.id,
          fileName: files.originalName,
          mimeType: files.mimeType,
          sizeBytes: files.sizeBytes,
        })
        .from(fileAttachments)
        .innerJoin(files, eq(files.id, fileAttachments.fileId))
        .where(
          and(
            eq(fileAttachments.targetType, "email_message"),
            inArray(
              fileAttachments.targetId,
              messages.map((message) => message.id)
            )
          )
        )
    : [];

  return {
    thread,
    messages: messages.map((message) => ({
      ...message,
      attachments: attachments
        .filter((attachment) => attachment.messageId === message.id)
        .map(({ messageId: _messageId, ...attachment }) => attachment),
    })),
  };
}

/** The most recent inbound message's RFC Message-ID, for threading a reply. */
export async function lastInboundMessageId(
  threadId: string
): Promise<string | null> {
  await requireRole("manager");
  const [row] = await db
    .select({ messageIdHeader: emailMessages.messageIdHeader })
    .from(emailMessages)
    .where(
      and(
        eq(emailMessages.threadId, threadId),
        eq(emailMessages.direction, "inbound")
      )
    )
    .orderBy(desc(emailMessages.sentAt))
    .limit(1);
  return row?.messageIdHeader ?? null;
}

/** Threading context for replying within a captured thread. */
export async function replyContext(threadId: string): Promise<{
  threadKey: string;
  inReplyTo: string | null;
  references: string | null;
} | null> {
  await requireRole("manager");
  const [t] = await db
    .select({ gmailThreadId: emailThreads.gmailThreadId })
    .from(emailThreads)
    .where(eq(emailThreads.id, threadId))
    .limit(1);
  if (!t) return null;
  const [parent] = await db
    .select({
      messageIdHeader: emailMessages.messageIdHeader,
      referenceHeaders: emailMessages.referenceHeaders,
    })
    .from(emailMessages)
    .where(
      and(
        eq(emailMessages.threadId, threadId),
        eq(emailMessages.direction, "inbound")
      )
    )
    .orderBy(desc(emailMessages.sentAt), desc(emailMessages.createdAt))
    .limit(1);
  const inReplyTo = parent?.messageIdHeader ?? null;
  const existingReferences = parent?.referenceHeaders?.length
    ? parent.referenceHeaders.join(" ")
    : t.gmailThreadId;
  return {
    threadKey: t.gmailThreadId,
    inReplyTo,
    references: buildReferencesHeader(existingReferences, inReplyTo),
  };
}
