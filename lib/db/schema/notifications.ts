import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

/**
 * In-app notifications. `type` is a free string (task_assigned, task_overdue,
 * mention, critical_blocker, standup_digest, …). Generated at the app/service
 * layer (not DB triggers) so they're testable and portable.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    eventKey: text("event_key"),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    data: jsonb("data"),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("notifications_event_recipient_uq").on(t.eventKey, t.userId),
    index("notifications_user_idx").on(t.userId, t.readAt, t.createdAt)]
);

/**
 * Durable optional-email delivery queue. Each in-app notification can create at
 * most one row; deleting the notification also removes unsent email work.
 */
export const notificationEmailQueue = pgTable(
  "notification_email_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    notificationId: uuid("notification_id")
      .notNull()
      .references(() => notifications.id, { onDelete: "cascade" }),
    recipientId: text("recipient_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    state: text("state").notNull().default("pending"),
    deliverAt: timestamp("deliver_at").notNull(),
    batchId: text("batch_id"),
    claimedAt: timestamp("claimed_at"),
    sentAt: timestamp("sent_at"),
    suppressedAt: timestamp("suppressed_at"),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastError: text("last_error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("notification_email_queue_notification_uq").on(t.notificationId),
    index("notification_email_queue_due_idx").on(t.state, t.deliverAt),
    index("notification_email_queue_recipient_idx").on(
      t.recipientId,
      t.state,
      t.deliverAt
    ),
  ]
);

/** Web Push subscriptions — one row per browser/device endpoint per user. */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    failureCount: integer("failure_count").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  },
  (t) => [index("push_subscriptions_user_idx").on(t.userId)]
);
