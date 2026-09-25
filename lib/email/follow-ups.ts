import "server-only";
import { isAdminRole } from "@/lib/auth/policy";

import { and, asc, desc, eq, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";

import { aiStructured } from "@/lib/ai/openrouter";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import {
  emailFollowUps,
  emailMessages,
  emailThreadProjects,
  emailThreads,
  notifications,
  partners,
  printContacts,
  printThreadLinks,
  projects,
  rightsHolders,
  user,
} from "@/lib/db/schema";
import { notify } from "@/lib/notifications";
import { getWorkspaceSettings } from "@/lib/workspace/queries";
import {
  addBusinessDaysInTimeZone,
  externalRecipient,
  fallbackFollowUpSummary,
  followUpDueAt,
  latestReplyText,
} from "./follow-up-policy";

const SUMMARY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary"],
  properties: {
    summary: { type: "string", minLength: 1, maxLength: 220 },
  },
} as const;

const SUMMARY_SYSTEM_PROMPT =
  "Summarize the current external dependency in one short sentence for a publishing project manager. Start with 'Waiting for'. Describe only what the newest outbound text explicitly asks the external recipient to provide, confirm, review, or decide. Ignore quoted email history. Do not invent names, dates, files, promises, urgency, or project facts. Return plain operational language, not an email recap.";

export type ExternalFollowUp = {
  id: string;
  threadId: string;
  projectId: string;
  projectSlug: string;
  projectTitle: string;
  ownerUserId: string | null;
  ownerName: string | null;
  counterparty: string | null;
  summary: string;
  dueAt: Date;
  snoozedUntil: Date | null;
  lastSentAt: Date | null;
  notifiedAt: Date | null;
};

async function activeManagerId(candidates: Array<string | null | undefined>) {
  const ids = [...new Set(candidates.filter((id): id is string => !!id))];
  if (!ids.length) return null;
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(
      and(
        inArray(user.id, ids),
        inArray(user.role, ["manager", "admin", "super_admin"]),
        eq(user.isActive, true),
        eq(user.isBot, false)
      )
    );
  const allowed = new Set(rows.map((row) => row.id));
  return ids.find((id) => allowed.has(id)) ?? null;
}

async function clearFollowUpNotifications(followUpId: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.type, "external_follow_up_due"),
        isNull(notifications.readAt),
        sql`(${notifications.data} ->> 'followUpId') = ${followUpId}`
      )
    );
}

export async function resolveFollowUpForThread(threadId: string) {
  const [row] = await db
    .update(emailFollowUps)
    .set({ resolvedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(emailFollowUps.threadId, threadId), isNull(emailFollowUps.resolvedAt)))
    .returning({ id: emailFollowUps.id });
  if (row) await clearFollowUpNotifications(row.id);
  return !!row;
}

/**
 * Resolve an older outbound watch when a printer's reply was captured as a
 * separate email thread. Matching by print run is intentionally strict: a
 * different conversation with the same vendor must not clear unrelated work.
 */
export async function resolveRelatedPrintFollowUps(input: {
  inboundThreadId: string;
  runId: string | null;
  repliedAt: Date;
}) {
  if (!input.runId) return 0;

  const rows = await db
    .select({
      id: emailFollowUps.id,
      threadId: emailFollowUps.threadId,
    })
    .from(emailFollowUps)
    .innerJoin(
      printThreadLinks,
      eq(printThreadLinks.threadId, emailFollowUps.threadId)
    )
    .innerJoin(emailMessages, eq(emailMessages.id, emailFollowUps.sourceMessageId))
    .where(
      and(
        eq(printThreadLinks.runId, input.runId),
        ne(emailFollowUps.threadId, input.inboundThreadId),
        isNull(emailFollowUps.resolvedAt),
        or(isNull(emailMessages.sentAt), lte(emailMessages.sentAt, input.repliedAt))
      )
    );
  if (!rows.length) return 0;

  const now = new Date();
  const ids = rows.map((row) => row.id);
  const threadIds = rows.map((row) => row.threadId);
  await db
    .update(emailFollowUps)
    .set({ resolvedAt: now, updatedAt: now })
    .where(inArray(emailFollowUps.id, ids));
  await db
    .update(emailThreads)
    .set({ status: "done", updatedAt: now })
    .where(inArray(emailThreads.id, threadIds));
  await Promise.all(ids.map(clearFollowUpNotifications));
  return rows.length;
}

export async function reassignFollowUpOwnerForThread(
  threadId: string,
  assigneeId: string | null
) {
  const [[thread], message] = await Promise.all([
    db
      .select({ ownerUserId: emailThreads.ownerUserId })
      .from(emailThreads)
      .where(eq(emailThreads.id, threadId))
      .limit(1),
    latestMessageForThread(threadId),
  ]);
  if (!thread) return;
  const ownerUserId = await activeManagerId([
    assigneeId,
    message?.attributedUserId,
    thread.ownerUserId,
  ]);
  await db
    .update(emailFollowUps)
    .set({ ownerUserId, updatedAt: new Date() })
    .where(and(eq(emailFollowUps.threadId, threadId), isNull(emailFollowUps.resolvedAt)));
}

export async function reconcileFollowUpForMessage(input: {
  threadId: string;
  messageId: string;
  direction: "inbound" | "outbound";
  sentAt: Date | null;
  subject: string | null;
  bodyText: string | null;
  recipients: string[];
  attributedUserId: string | null;
  projectLinked: boolean;
  suppressInitialNotification?: boolean;
}): Promise<{ followUpId: string | null; shouldSummarize: boolean }> {
  if (input.direction === "inbound") {
    await db
      .update(emailThreads)
      .set({ status: "open", updatedAt: new Date() })
      .where(eq(emailThreads.id, input.threadId));
    await resolveFollowUpForThread(input.threadId);
    return { followUpId: null, shouldSummarize: false };
  }
  if (!input.projectLinked) return { followUpId: null, shouldSummarize: false };

  const [settings, [thread]] = await Promise.all([
    getWorkspaceSettings(),
    db
      .select({
        ownerUserId: emailThreads.ownerUserId,
        assigneeId: emailThreads.assigneeId,
        knownCounterparty: sql<string | null>`coalesce(${printContacts.company}, ${printContacts.name}, ${rightsHolders.name}, ${partners.name})`,
      })
      .from(emailThreads)
      .leftJoin(rightsHolders, eq(rightsHolders.id, emailThreads.holderId))
      .leftJoin(partners, eq(partners.id, emailThreads.partnerId))
      .leftJoin(printThreadLinks, eq(printThreadLinks.threadId, emailThreads.id))
      .leftJoin(printContacts, eq(printContacts.id, printThreadLinks.contactId))
      .where(eq(emailThreads.id, input.threadId))
      .limit(1),
  ]);
  if (!thread) return { followUpId: null, shouldSummarize: false };

  const sentAt = input.sentAt ?? new Date();
  const externalAddress = externalRecipient(
    input.recipients,
    settings.internalEmailDomains
  );
  // An internal forward into the capture mailbox is attributed as outbound but
  // is not an external request. Only actual external recipients create a watch.
  if (!externalAddress) return { followUpId: null, shouldSummarize: false };
  const counterparty = thread.knownCounterparty ?? externalAddress;
  const dueAt = addBusinessDaysInTimeZone({
    from: sentAt,
    businessDays: settings.externalFollowUpBusinessDays,
    workDays: settings.workDays,
    timeZone: settings.timezone,
  });
  const ownerUserId = await activeManagerId([
    thread.assigneeId,
    input.attributedUserId,
    thread.ownerUserId,
  ]);
  const now = new Date();
  const suppress = input.suppressInitialNotification && dueAt <= now;
  const [row] = await db
    .insert(emailFollowUps)
    .values({
      threadId: input.threadId,
      sourceMessageId: input.messageId,
      ownerUserId,
      counterparty,
      summary: fallbackFollowUpSummary(input.subject),
      dueAt,
      notifiedAt: suppress ? now : null,
    })
    .onConflictDoUpdate({
      target: emailFollowUps.threadId,
      set: {
        sourceMessageId: input.messageId,
        ownerUserId,
        counterparty,
        summary: fallbackFollowUpSummary(input.subject),
        dueAt,
        snoozedUntil: null,
        notifiedAt: suppress ? now : null,
        resolvedAt: null,
        updatedAt: now,
      },
    })
    .returning({ id: emailFollowUps.id });
  await db
    .update(emailThreads)
    .set({ status: "waiting", updatedAt: now })
    .where(eq(emailThreads.id, input.threadId));
  if (row) await clearFollowUpNotifications(row.id);
  return { followUpId: row?.id ?? null, shouldSummarize: !!latestReplyText(input.bodyText) };
}

export async function refreshFollowUpSummary(followUpId: string) {
  const [row] = await db
    .select({
      id: emailFollowUps.id,
      sourceMessageId: emailFollowUps.sourceMessageId,
      subject: emailMessages.subject,
      bodyText: emailMessages.bodyText,
      counterparty: emailFollowUps.counterparty,
      projectId: projects.id,
      projectTitle: projects.title,
    })
    .from(emailFollowUps)
    .innerJoin(emailMessages, eq(emailMessages.id, emailFollowUps.sourceMessageId))
    .innerJoin(emailThreadProjects, eq(emailThreadProjects.threadId, emailFollowUps.threadId))
    .innerJoin(projects, eq(projects.id, emailThreadProjects.projectId))
    .where(and(eq(emailFollowUps.id, followUpId), isNull(emailFollowUps.resolvedAt)))
    .orderBy(asc(emailThreadProjects.createdAt))
    .limit(1);
  if (!row) return false;
  const latestText = latestReplyText(row.bodyText);
  if (!latestText) return false;
  try {
    const result = (await aiStructured(
      "email_follow_up_summary",
      [
        { role: "system", content: SUMMARY_SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            project: row.projectTitle,
            recipient: row.counterparty,
            subject: row.subject,
            newestOutboundText: latestText,
          }),
        },
      ],
      { name: "email_follow_up_summary", schema: SUMMARY_SCHEMA },
      {
        metering: {
          scope: "workspace",
          feature: "correspondence",
          operation: "summarize_external_follow_up",
          taskKey: "email_follow_up_summary",
          projectId: row.projectId,
          entityType: "email_follow_up",
          entityId: row.id,
        },
        timeoutMs: 30_000,
      }
    )) as { summary?: string };
    const summary = String(result.summary ?? "").trim().slice(0, 220);
    if (!summary) return false;
    const updated = await db
      .update(emailFollowUps)
      .set({ summary, updatedAt: new Date() })
      .where(
        and(
          eq(emailFollowUps.id, row.id),
          eq(emailFollowUps.sourceMessageId, row.sourceMessageId),
          isNull(emailFollowUps.resolvedAt)
        )
      )
      .returning({ id: emailFollowUps.id });
    return updated.length > 0;
  } catch (error) {
    console.error("external follow-up summary failed:", error);
    return false;
  }
}

async function latestMessageForThread(threadId: string) {
  const [message] = await db
    .select({
      id: emailMessages.id,
      direction: emailMessages.direction,
      sentAt: emailMessages.sentAt,
      subject: emailMessages.subject,
      bodyText: emailMessages.bodyText,
      toAddrs: emailMessages.toAddrs,
      attributedUserId: emailMessages.attributedUserId,
    })
    .from(emailMessages)
    .where(eq(emailMessages.threadId, threadId))
    .orderBy(desc(emailMessages.sentAt), desc(emailMessages.createdAt))
    .limit(1);
  return message ?? null;
}

export async function ensureFollowUpForThread(
  threadId: string,
  options: { suppressInitialNotification?: boolean } = {}
) {
  const [message, [link]] = await Promise.all([
    latestMessageForThread(threadId),
    db
      .select({ projectId: emailThreadProjects.projectId })
      .from(emailThreadProjects)
      .where(eq(emailThreadProjects.threadId, threadId))
      .limit(1),
  ]);
  if (!message || message.direction !== "outbound" || !link) return null;
  const result = await reconcileFollowUpForMessage({
    threadId,
    messageId: message.id,
    direction: message.direction,
    sentAt: message.sentAt,
    subject: message.subject,
    bodyText: message.bodyText,
    recipients: message.toAddrs ?? [],
    attributedUserId: message.attributedUserId,
    projectLinked: true,
    suppressInitialNotification: options.suppressInitialNotification,
  });
  return result.followUpId;
}

export async function backfillExternalFollowUps(limit = 25) {
  const rows = await db
    .select({ id: emailThreads.id })
    .from(emailThreads)
    .innerJoin(emailThreadProjects, eq(emailThreadProjects.threadId, emailThreads.id))
    .leftJoin(emailFollowUps, eq(emailFollowUps.threadId, emailThreads.id))
    .where(and(eq(emailThreads.lastDirection, "outbound"), isNull(emailFollowUps.id)))
    .groupBy(emailThreads.id)
    .orderBy(desc(emailThreads.lastMessageAt))
    .limit(Math.max(1, Math.min(100, limit)));
  const created: string[] = [];
  for (const row of rows) {
    const id = await ensureFollowUpForThread(row.id, {
      suppressInitialNotification: true,
    });
    if (id) created.push(id);
  }
  return created;
}

export async function notifyDueExternalFollowUps(now = new Date()) {
  const candidates = await db
    .select({
      id: emailFollowUps.id,
      threadId: emailFollowUps.threadId,
      ownerUserId: emailFollowUps.ownerUserId,
      summary: emailFollowUps.summary,
      counterparty: emailFollowUps.counterparty,
      projectTitle: projects.title,
    })
    .from(emailFollowUps)
    .innerJoin(emailThreads, eq(emailThreads.id, emailFollowUps.threadId))
    .innerJoin(projects, eq(projects.id, emailThreads.projectId))
    .where(
      and(
        isNull(emailFollowUps.resolvedAt),
        isNull(emailFollowUps.notifiedAt),
        or(
          and(isNull(emailFollowUps.snoozedUntil), lte(emailFollowUps.dueAt, now)),
          lte(emailFollowUps.snoozedUntil, now)
        )
      )
    )
    .orderBy(asc(emailFollowUps.dueAt));

  let notified = 0;
  const seen = new Set<string>();
  for (const item of candidates) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    const [claimed] = await db
      .update(emailFollowUps)
      .set({ notifiedAt: now, updatedAt: now })
      .where(and(eq(emailFollowUps.id, item.id), isNull(emailFollowUps.notifiedAt)))
      .returning({ id: emailFollowUps.id });
    if (!claimed) continue;
    let recipient = item.ownerUserId;
    if (!recipient) {
      const [manager] = await db
        .select({ id: user.id })
        .from(user)
        .where(
          and(
            inArray(user.role, ["manager", "admin", "super_admin"]),
            eq(user.isActive, true),
            eq(user.isBot, false)
          )
        )
        .orderBy(asc(user.createdAt))
        .limit(1);
      recipient = manager?.id ?? null;
    }
    if (!recipient) continue;
    await notify({
      userId: recipient,
      type: "external_follow_up_due",
      title: item.counterparty
        ? `Follow up with ${item.counterparty}`
        : "External follow-up due",
      body: item.summary,
      project: item.projectTitle,
      link: `/correspondence/${item.threadId}`,
      data: { followUpId: item.id, threadId: item.threadId },
      email: false,
    });
    notified += 1;
  }
  return notified;
}

const followUpColumns = {
  id: emailFollowUps.id,
  threadId: emailFollowUps.threadId,
  projectId: projects.id,
  projectSlug: projects.slug,
  projectTitle: projects.title,
  ownerUserId: emailFollowUps.ownerUserId,
  ownerName: user.name,
  counterparty: emailFollowUps.counterparty,
  summary: emailFollowUps.summary,
  dueAt: emailFollowUps.dueAt,
  snoozedUntil: emailFollowUps.snoozedUntil,
  lastSentAt: emailMessages.sentAt,
  notifiedAt: emailFollowUps.notifiedAt,
};

export async function listProjectExternalFollowUps(projectId: string) {
  await requireRole("manager");
  return db
    .select(followUpColumns)
    .from(emailFollowUps)
    .innerJoin(emailThreadProjects, eq(emailThreadProjects.threadId, emailFollowUps.threadId))
    .innerJoin(projects, eq(projects.id, emailThreadProjects.projectId))
    .innerJoin(emailMessages, eq(emailMessages.id, emailFollowUps.sourceMessageId))
    .leftJoin(user, eq(user.id, emailFollowUps.ownerUserId))
    .where(
      and(
        eq(emailThreadProjects.projectId, projectId),
        isNull(emailFollowUps.resolvedAt)
      )
    )
    .orderBy(asc(emailFollowUps.dueAt));
}

export async function listMyExternalFollowUps(userId: string) {
  const { user: currentUser } = await requireRole("manager");
  if (currentUser.id !== userId && !isAdminRole(currentUser)) return [];
  return db
    .select(followUpColumns)
    .from(emailFollowUps)
    .innerJoin(emailThreads, eq(emailThreads.id, emailFollowUps.threadId))
    .innerJoin(projects, eq(projects.id, emailThreads.projectId))
    .innerJoin(emailMessages, eq(emailMessages.id, emailFollowUps.sourceMessageId))
    .leftJoin(user, eq(user.id, emailFollowUps.ownerUserId))
    .where(
      and(
        or(eq(emailFollowUps.ownerUserId, userId), isNull(emailFollowUps.ownerUserId)),
        isNull(emailFollowUps.resolvedAt)
      )
    )
    .orderBy(asc(emailFollowUps.dueAt));
}

export async function getThreadExternalFollowUp(threadId: string) {
  await requireRole("manager");
  const rows = await db
    .select(followUpColumns)
    .from(emailFollowUps)
    .innerJoin(emailThreads, eq(emailThreads.id, emailFollowUps.threadId))
    .innerJoin(projects, eq(projects.id, emailThreads.projectId))
    .innerJoin(emailMessages, eq(emailMessages.id, emailFollowUps.sourceMessageId))
    .leftJoin(user, eq(user.id, emailFollowUps.ownerUserId))
    .where(and(eq(emailFollowUps.threadId, threadId), isNull(emailFollowUps.resolvedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export async function snoozeFollowUpRecord(id: string, businessDays: number) {
  const settings = await getWorkspaceSettings();
  const until = addBusinessDaysInTimeZone({
    from: new Date(),
    businessDays,
    workDays: settings.workDays,
    timeZone: settings.timezone,
  });
  const [row] = await db
    .update(emailFollowUps)
    .set({ snoozedUntil: until, notifiedAt: null, updatedAt: new Date() })
    .where(and(eq(emailFollowUps.id, id), isNull(emailFollowUps.resolvedAt)))
    .returning({ id: emailFollowUps.id });
  if (row) await clearFollowUpNotifications(row.id);
  return until;
}

export async function resolveFollowUpRecord(id: string) {
  const [row] = await db
    .update(emailFollowUps)
    .set({ resolvedAt: new Date(), updatedAt: new Date() })
    .where(eq(emailFollowUps.id, id))
    .returning({ id: emailFollowUps.id, threadId: emailFollowUps.threadId });
  if (!row) return null;
  await clearFollowUpNotifications(row.id);
  await db
    .update(emailThreads)
    .set({ status: "done", updatedAt: new Date() })
    .where(eq(emailThreads.id, row.threadId));
  return row;
}

export function externalFollowUpEffectiveDueAt(item: {
  dueAt: Date;
  snoozedUntil: Date | null;
}) {
  return followUpDueAt(item);
}
