import "server-only";

import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  emailPreferences,
  notifications,
  partnerContacts,
  partners,
  pushSubscriptions,
} from "@/lib/db/schema";
import { resolveFundingPartnerDirectoryMatch } from "@/lib/email/counterparty-match";
import type { EmailDeliveryMode } from "./email-policy";

/** Read the project context label stored in a notification's `data`, if any. */
export function notificationProject(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const value = (data as Record<string, unknown>).project;
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function getEmailPreferences(userId: string) {
  const [p] = await db
    .select()
    .from(emailPreferences)
    .where(eq(emailPreferences.userId, userId))
    .limit(1);
  return {
    workflowOptIn: p?.workflowOptIn ?? true,
    standupOptIn: p?.standupOptIn ?? true,
    emailDeliveryMode: (p?.emailDeliveryMode ?? "bundled") as EmailDeliveryMode,
    emailDigestTimeMinutes: p?.emailDigestTimeMinutes ?? 480,
    quietHoursEnabled: p?.quietHoursEnabled ?? false,
    quietHoursStart: p?.quietHoursStart ?? 1320,
    quietHoursEnd: p?.quietHoursEnd ?? 420,
    pushPausedUntil: p?.pushPausedUntil ?? null,
    pushScheduleMode: (p?.pushScheduleMode ?? "off") as "off" | "quiet" | "work",
    workHoursStart: p?.workHoursStart ?? 480,
    workHoursEnd: p?.workHoursEnd ?? 960,
    pushOnlyWhenActive: p?.pushOnlyWhenActive ?? false,
    pushReviewSuggestions: p?.pushReviewSuggestions ?? false,
    emailTaskSuggestionsEnabled: p?.emailTaskSuggestionsEnabled ?? true,
    emailTaskLearningEnabled: p?.emailTaskLearningEnabled ?? true,
  };
}

/** A user's push-subscribed devices, most recently active first. */
export async function listPushDevices(userId: string) {
  return db
    .select({
      id: pushSubscriptions.id,
      userAgent: pushSubscriptions.userAgent,
      lastSeenAt: pushSubscriptions.lastSeenAt,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .orderBy(desc(pushSubscriptions.lastSeenAt));
}

export async function getUnreadCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
        ne(notifications.type, "email_received")
      )
    );
  return row?.n ?? 0;
}

/** High-signal work alerts for the bell; routine correspondence has its own inbox. */
export async function listBellNotifications(userId: string, limit = 30) {
  return db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        ne(notifications.type, "email_received")
      )
    )
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function listNotifications(userId: string, limit = 30) {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function listUnreadNotificationsByType(
  userId: string,
  type: string,
  limit = 5
) {
  return db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.type, type),
        isNull(notifications.readAt)
      )
    )
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export type PossibleCounterpartySuggestion = {
  notificationId: string;
  type: "rights_holder" | "funding_partner" | "printer";
  name: string;
  contactName: string;
  email: string;
  confidence: number;
  reason: string;
  existingId: string | null;
  organizationId: string | null;
  organizationName: string;
  organizationAction: "existing" | "create";
  contactAction: "existing" | "create" | "none";
};

export async function getPossibleCounterpartySuggestion(
  userId: string,
  threadId: string
): Promise<PossibleCounterpartySuggestion | null> {
  const [row] = await db
    .select({ id: notifications.id, data: notifications.data })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.type, "possible_counterparty"),
        isNull(notifications.readAt),
        sql`(${notifications.data} ->> 'threadId') = ${threadId}`
      )
    )
    .orderBy(desc(notifications.createdAt))
    .limit(1);
  if (!row?.data || typeof row.data !== "object") return null;
  const counterparty = (row.data as Record<string, unknown>).counterparty;
  if (!counterparty || typeof counterparty !== "object") return null;
  const data = counterparty as Record<string, unknown>;
  if (
    !["rights_holder", "funding_partner", "printer"].includes(String(data.type)) ||
    typeof data.name !== "string" ||
    typeof data.contactName !== "string" ||
    typeof data.email !== "string" ||
    typeof data.confidence !== "number" ||
    typeof data.reason !== "string" ||
    !(typeof data.existingId === "string" || data.existingId === null)
  ) {
    return null;
  }
  const type = data.type as PossibleCounterpartySuggestion["type"];
  const existingId = data.existingId as string | null;
  let organizationName = data.name;
  let organizationId = existingId;
  let organizationAction: PossibleCounterpartySuggestion["organizationAction"] =
    existingId ? "existing" : "create";
  let contactAction: PossibleCounterpartySuggestion["contactAction"] = "none";

  if (type === "funding_partner") {
    const [organizations, contacts] = await Promise.all([
      db.select({ id: partners.id, name: partners.name }).from(partners),
      db
        .select({
          id: partnerContacts.id,
          partnerId: partnerContacts.partnerId,
          email: partnerContacts.email,
        })
        .from(partnerContacts),
    ]);
    const match = resolveFundingPartnerDirectoryMatch(
      { name: data.name, email: data.email, existingId },
      organizations,
      contacts
    );
    organizationName = match.organizationName;
    organizationId = match.organizationId;
    organizationAction = match.organizationAction;
    contactAction = match.contactAction;
  }

  return {
    notificationId: row.id,
    type,
    name: data.name,
    contactName: data.contactName,
    email: data.email,
    confidence: data.confidence,
    reason: data.reason,
    existingId,
    organizationId,
    organizationName,
    organizationAction,
    contactAction,
  };
}

export type GrantReminderCadence =
  | "one_off"
  | "monthly"
  | "quarterly"
  | "annual";

export type PossibleGrantReminderSuggestion = {
  notificationId: string;
  reminders: Array<{
    title: string;
    detail: string;
    dueDate: string | null;
    recurring: boolean;
    cadence: GrantReminderCadence;
  }>;
  targetProjects: Array<{ id: string; title: string }>;
};

const GRANT_REMINDER_CADENCES: readonly GrantReminderCadence[] = [
  "one_off",
  "monthly",
  "quarterly",
  "annual",
];

/**
 * The pending grant-reminder suggestion for a thread (a funder's dated
 * deliverable or recurring reporting duty), awaiting a manager's approval on the
 * correspondence thread. Read from notification state, like the counterparty
 * suggestion. Returns null when there are no well-formed reminders or targets.
 */
export async function getPossibleGrantReminderSuggestion(
  userId: string,
  threadId: string
): Promise<PossibleGrantReminderSuggestion | null> {
  const [row] = await db
    .select({ id: notifications.id, data: notifications.data })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.type, "possible_grant_reminder"),
        isNull(notifications.readAt),
        sql`(${notifications.data} ->> 'threadId') = ${threadId}`
      )
    )
    .orderBy(desc(notifications.createdAt))
    .limit(1);
  if (!row?.data || typeof row.data !== "object") return null;
  const data = row.data as Record<string, unknown>;

  const rawReminders = Array.isArray(data.reminders) ? data.reminders : [];
  const reminders = rawReminders.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const r = item as Record<string, unknown>;
    if (typeof r.title !== "string" || !r.title.trim()) return [];
    const cadence = GRANT_REMINDER_CADENCES.includes(
      r.cadence as GrantReminderCadence
    )
      ? (r.cadence as GrantReminderCadence)
      : "one_off";
    return [
      {
        title: r.title,
        detail: typeof r.detail === "string" ? r.detail : "",
        dueDate:
          typeof r.dueDate === "string" && r.dueDate ? r.dueDate : null,
        recurring: r.recurring === true,
        cadence,
      },
    ];
  });
  if (!reminders.length) return null;

  const ids = Array.isArray(data.targetProjectIds) ? data.targetProjectIds : [];
  const titles = Array.isArray(data.targetTitles) ? data.targetTitles : [];
  const targetProjects = ids
    .map((id, i) => ({ id: String(id), title: String(titles[i] ?? "") }))
    .filter((project) => project.id);
  if (!targetProjects.length) return null;

  return { notificationId: row.id, reminders, targetProjects };
}
