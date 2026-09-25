import "server-only";

import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { db, type Db } from "@/lib/db";
import {
  emailPreferences,
  notificationEmailQueue,
  notifications,
  user,
} from "@/lib/db/schema";
import { sendNotificationEmail } from "@/lib/email/notification-digest";
import { generateToken } from "@/lib/tokens";
import {
  categoryEnabled,
  EMAIL_DELIVERY_MODES,
  notificationEmailCategory,
  notificationEmailDeliveryAt,
  notificationTypeCanEmail,
  retryDeliveryAt,
  type EmailDeliveryMode,
  type NotificationEmailCategory,
} from "./email-policy";
import {
  MAX_EMAIL_ATTEMPTS,
  runNotificationEmailWorker,
  type EmailWorkerStore,
  type NotificationEmailClaim,
} from "./email-worker";

type NotificationTransaction = Parameters<Parameters<Db["transaction"]>[0]>[0];

function validMode(value: string | null | undefined): EmailDeliveryMode {
  return EMAIL_DELIVERY_MODES.includes(value as EmailDeliveryMode)
    ? (value as EmailDeliveryMode)
    : "bundled";
}

export async function ensureEmailPreferences(userId: string) {
  const [existing] = await db
    .select()
    .from(emailPreferences)
    .where(eq(emailPreferences.userId, userId))
    .limit(1);
  if (existing) return existing;
  await db
    .insert(emailPreferences)
    .values({ userId, unsubscribeToken: generateToken() })
    .onConflictDoNothing();
  const [created] = await db
    .select()
    .from(emailPreferences)
    .where(eq(emailPreferences.userId, userId))
    .limit(1);
  return created;
}

/** Best-effort enqueue after the in-app notification has been persisted. */
export async function enqueueNotificationEmail({
  notificationId,
  recipientId,
  type,
  now = new Date(),
}: {
  notificationId: string;
  recipientId: string;
  type: string;
  now?: Date;
}): Promise<boolean> {
  if (!notificationTypeCanEmail(type)) return false;
  const [recipient, prefs] = await Promise.all([
    db
      .select({
        email: user.email,
        timezone: user.timezone,
        isActive: user.isActive,
        isBot: user.isBot,
      })
      .from(user)
      .where(eq(user.id, recipientId))
      .limit(1)
      .then((rows) => rows[0]),
    ensureEmailPreferences(recipientId),
  ]);
  if (!recipient?.email || !recipient.isActive || recipient.isBot || !prefs) return false;

  const category = notificationEmailCategory(type);
  if (!categoryEnabled(category, prefs)) return false;
  const mode = validMode(prefs.emailDeliveryMode);
  const deliverAt = notificationEmailDeliveryAt({
    mode,
    now,
    timezone: recipient.timezone,
    digestTimeMinutes: prefs.emailDigestTimeMinutes,
    type,
  });
  await db
    .insert(notificationEmailQueue)
    .values({ notificationId, recipientId, category, deliverAt })
    .onConflictDoNothing();
  return true;
}

export async function suppressPendingEmailCategory(
  tx: NotificationTransaction,
  userId: string,
  category: NotificationEmailCategory,
  now: Date
) {
  await tx
    .update(notificationEmailQueue)
    .set({
      state: "suppressed",
      suppressedAt: now,
      claimedAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(notificationEmailQueue.recipientId, userId),
        eq(notificationEmailQueue.category, category),
        eq(notificationEmailQueue.state, "pending")
      )
    );
}

export async function unsubscribeNotificationEmail(
  token: string,
  category: NotificationEmailCategory | "all"
) {
  if (!token) return;
  const now = new Date();
  await db.transaction(async (tx) => {
    const [prefs] = await tx
      .select({ userId: emailPreferences.userId })
      .from(emailPreferences)
      .where(eq(emailPreferences.unsubscribeToken, token))
      .limit(1);
    if (!prefs) return;
    await tx
      .update(emailPreferences)
      .set(
        category === "all"
          ? { workflowOptIn: false, standupOptIn: false, updatedAt: now }
          : category === "workflow"
            ? { workflowOptIn: false, updatedAt: now }
            : { standupOptIn: false, updatedAt: now }
      )
      .where(eq(emailPreferences.unsubscribeToken, token));
    const categories: NotificationEmailCategory[] =
      category === "all" ? ["workflow", "standup"] : [category];
    for (const current of categories) {
      await suppressPendingEmailCategory(tx, prefs.userId, current, now);
    }
  });
}

export async function reschedulePendingEmailRows(
  tx: NotificationTransaction,
  {
    userId,
    mode,
    digestTimeMinutes,
    timezone,
    now,
  }: {
    userId: string;
    mode: EmailDeliveryMode;
    digestTimeMinutes: number;
    timezone: string;
    now: Date;
  }
) {
  const deliverAt = notificationEmailDeliveryAt({
    mode,
    now,
    timezone,
    digestTimeMinutes,
  });
  await tx
    .update(notificationEmailQueue)
    .set({ deliverAt, updatedAt: now })
    .where(
      and(
        eq(notificationEmailQueue.recipientId, userId),
        eq(notificationEmailQueue.state, "pending")
      )
    );
}

const store: EmailWorkerStore = {
  async listDueRecipientIds(now) {
    const staleBefore = new Date(now.getTime() - 15 * 60_000);
    await db
      .update(notificationEmailQueue)
      .set({ state: "pending", claimedAt: null, updatedAt: now })
      .where(
        and(
          eq(notificationEmailQueue.state, "processing"),
          lte(notificationEmailQueue.claimedAt, staleBefore)
        )
      );
    const rows = await db
      .selectDistinct({ recipientId: notificationEmailQueue.recipientId })
      .from(notificationEmailQueue)
      .where(
        and(
          eq(notificationEmailQueue.state, "pending"),
          lte(notificationEmailQueue.deliverAt, now)
        )
      )
      .orderBy(asc(notificationEmailQueue.recipientId))
      .limit(250);
    return rows.map((row) => row.recipientId);
  },

  async claimRecipient(recipientId, now): Promise<NotificationEmailClaim | null> {
    return db.transaction(async (tx) => {
      // A recipient-scoped transaction lock prevents concurrent workers from
      // splitting a due group. SMTP happens after this transaction commits.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${recipientId}))`);
      const rows = await tx
        .select({
          queueId: notificationEmailQueue.id,
          batchId: notificationEmailQueue.batchId,
          attemptCount: notificationEmailQueue.attemptCount,
          category: notificationEmailQueue.category,
          type: notifications.type,
          title: notifications.title,
          body: notifications.body,
          link: notifications.link,
          data: notifications.data,
          readAt: notifications.readAt,
          createdAt: notifications.createdAt,
        })
        .from(notificationEmailQueue)
        .innerJoin(
          notifications,
          eq(notifications.id, notificationEmailQueue.notificationId)
        )
        .where(
          and(
            eq(notificationEmailQueue.recipientId, recipientId),
            eq(notificationEmailQueue.state, "pending"),
            lte(notificationEmailQueue.deliverAt, now)
          )
        )
        .orderBy(asc(notificationEmailQueue.createdAt));
      if (rows.length === 0) return null;

      const [[recipient], [prefs]] = await Promise.all([
        tx
          .select({ email: user.email, isActive: user.isActive, isBot: user.isBot })
          .from(user)
          .where(eq(user.id, recipientId))
          .limit(1),
        tx
          .select()
          .from(emailPreferences)
          .where(eq(emailPreferences.userId, recipientId))
          .limit(1),
      ]);
      const mode = validMode(prefs?.emailDeliveryMode);
      const canonicalBatchId = rows.find((row) => row.batchId)?.batchId ?? randomUUID();
      const ids = rows.map((row) => row.queueId);
      await tx
        .update(notificationEmailQueue)
        .set({
          state: "processing",
          claimedAt: now,
          batchId:
            mode === "immediate"
              ? sql`coalesce(${notificationEmailQueue.batchId}, ${notificationEmailQueue.id}::text)`
              : canonicalBatchId,
          attemptCount: sql`${notificationEmailQueue.attemptCount} + 1`,
          updatedAt: now,
        })
        .where(inArray(notificationEmailQueue.id, ids));

      return {
        recipientId,
        email: recipient?.email ?? null,
        isActive: recipient?.isActive ?? false,
        isBot: recipient?.isBot ?? true,
        workflowOptIn: prefs?.workflowOptIn ?? false,
        standupOptIn: prefs?.standupOptIn ?? false,
        unsubscribeToken: prefs?.unsubscribeToken ?? null,
        mode,
        batchId: canonicalBatchId,
        items: rows.map((row) => ({
          queueId: row.queueId,
          batchId:
            mode === "immediate" ? (row.batchId ?? row.queueId) : canonicalBatchId,
          attemptCount: row.attemptCount + 1,
          category: row.category as NotificationEmailCategory,
          type: row.type,
          title: row.title,
          body: row.body,
          project:
            row.data && typeof row.data === "object" && "project" in row.data &&
            typeof row.data.project === "string"
              ? row.data.project
              : null,
          link: row.link,
          readAt: row.readAt,
          createdAt: row.createdAt,
        })),
      };
    });
  },

  async recheckClaim(claim) {
    const ids = claim.items.map((item) => item.queueId);
    if (ids.length === 0) return claim;
    const [rows, [recipient], [prefs]] = await Promise.all([
      db
        .select({
          queueId: notificationEmailQueue.id,
          readAt: notifications.readAt,
        })
        .from(notificationEmailQueue)
        .innerJoin(
          notifications,
          eq(notifications.id, notificationEmailQueue.notificationId)
        )
        .where(
          and(
            inArray(notificationEmailQueue.id, ids),
            eq(notificationEmailQueue.state, "processing")
          )
        ),
      db
        .select({ email: user.email, isActive: user.isActive, isBot: user.isBot })
        .from(user)
        .where(eq(user.id, claim.recipientId))
        .limit(1),
      db
        .select()
        .from(emailPreferences)
        .where(eq(emailPreferences.userId, claim.recipientId))
        .limit(1),
    ]);
    const readById = new Map(rows.map((row) => [row.queueId, row.readAt]));
    return {
      ...claim,
      email: recipient?.email ?? null,
      isActive: recipient?.isActive ?? false,
      isBot: recipient?.isBot ?? true,
      workflowOptIn: prefs?.workflowOptIn ?? false,
      standupOptIn: prefs?.standupOptIn ?? false,
      unsubscribeToken: prefs?.unsubscribeToken ?? null,
      mode: validMode(prefs?.emailDeliveryMode),
      items: claim.items
        .filter((item) => readById.has(item.queueId))
        .map((item) => ({ ...item, readAt: readById.get(item.queueId) ?? null })),
    };
  },

  async markSent(queueIds, now) {
    if (queueIds.length === 0) return;
    await db
      .update(notificationEmailQueue)
      .set({ state: "sent", sentAt: now, claimedAt: null, lastError: null, updatedAt: now })
      .where(
        and(
          inArray(notificationEmailQueue.id, queueIds),
          eq(notificationEmailQueue.state, "processing")
        )
      );
  },

  async markSuppressed(queueIds, now) {
    if (queueIds.length === 0) return;
    await db
      .update(notificationEmailQueue)
      .set({ state: "suppressed", suppressedAt: now, claimedAt: null, updatedAt: now })
      .where(
        and(
          inArray(notificationEmailQueue.id, queueIds),
          eq(notificationEmailQueue.state, "processing")
        )
      );
  },

  async markFailed(items, now, error) {
    let retried = 0;
    let failed = 0;
    await db.transaction(async (tx) => {
      for (const item of items) {
        if (item.attemptCount >= MAX_EMAIL_ATTEMPTS) {
          await tx
            .update(notificationEmailQueue)
            .set({ state: "failed", claimedAt: null, lastError: error, updatedAt: now })
            .where(eq(notificationEmailQueue.id, item.queueId));
          failed += 1;
        } else {
          await tx
            .update(notificationEmailQueue)
            .set({
              state: "pending",
              claimedAt: null,
              deliverAt: retryDeliveryAt(now, item.attemptCount),
              lastError: error,
              updatedAt: now,
            })
            .where(eq(notificationEmailQueue.id, item.queueId));
          retried += 1;
        }
      }
    });
    return { retried, failed };
  },
};

export async function processNotificationEmailQueue(now = new Date()) {
  return runNotificationEmailWorker({ store, send: sendNotificationEmail, now });
}
