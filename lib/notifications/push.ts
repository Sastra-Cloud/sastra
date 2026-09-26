import "server-only";

import { appHostname } from "@/lib/app-hostname";
import { vapidPublicKeyFromEnv } from "@/lib/push/keys";

import webpush from "web-push";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  emailPreferences,
  pushSubscriptions,
  user,
  userPresence,
} from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { derivePresence, type ManualStatus } from "@/lib/presence/status";
import { getUnreadCount } from "./queries";
import { shouldDeliverPush, type PushPrefs } from "./push-gate";

let configured: boolean | null = null;
function configure(): boolean {
  if (configured !== null) return configured;
  const pub = vapidPublicKeyFromEnv();
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || `mailto:notifications@${appHostname()}`;
  if (!pub || !priv) {
    configured = false;
    return false;
  }
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
  return true;
}

const DEFAULT_PREFS: PushPrefs = {
  quietHoursEnabled: false,
  quietHoursStart: 1320,
  quietHoursEnd: 420,
  pushPausedUntil: null,
  pushOnlyWhenActive: false,
  pushReviewSuggestions: false,
};

export type PushPayload = {
  type: string;
  title: string;
  body?: string;
  url?: string;
  tag?: string;
};

/** Send a web push to all of a user's devices, gated by prefs/quiet-hours/OOO.
 *  Best-effort: never throws (callers shouldn't depend on push succeeding). */
export async function deliverPush(
  userId: string,
  payload: PushPayload
): Promise<void> {
  try {
    if (!configure()) return; // VAPID not configured → no-op

    // Cheapest gate first: most users have no device registered.
    const subs = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));
    if (subs.length === 0) return;

    const [u] = await db
      .select({ tz: user.timezone, isActive: user.isActive, isBot: user.isBot })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    if (!u || !u.isActive || u.isBot) return;

    const [pref] = await db
      .select()
      .from(emailPreferences)
      .where(eq(emailPreferences.userId, userId))
      .limit(1);
    const prefs: PushPrefs = pref
      ? {
          quietHoursEnabled: pref.quietHoursEnabled,
          quietHoursStart: pref.quietHoursStart,
          quietHoursEnd: pref.quietHoursEnd,
          pushPausedUntil: pref.pushPausedUntil,
          pushOnlyWhenActive: pref.pushOnlyWhenActive,
          pushReviewSuggestions: pref.pushReviewSuggestions,
        }
      : DEFAULT_PREFS;

    const now = new Date();

    // Only pay for a presence lookup when the user opted into active-only push.
    let isActive = true;
    if (prefs.pushOnlyWhenActive) {
      const [p] = await db
        .select()
        .from(userPresence)
        .where(eq(userPresence.userId, userId))
        .limit(1);
      isActive = p
        ? derivePresence(
            {
              lastActiveAt: p.lastActiveAt,
              lastHiddenAt: p.lastHiddenAt,
              manualStatus: p.manualStatus as ManualStatus,
            },
            now
          ) === "online"
        : false;
    }

    if (!shouldDeliverPush(prefs, payload.type, now, u.tz, isActive)) return;

    // `unread` drives the home-screen app-icon badge in the service worker. Web
    // push never badges the icon on its own (iOS especially), so we ship the
    // count and let sw.js call navigator.setAppBadge().
    const unread = await getUnreadCount(userId);
    const json = JSON.stringify({
      title: payload.title,
      body: payload.body ?? "",
      url: payload.url ?? "/dashboard",
      tag: payload.tag,
      unread,
    });

    await sendToSubscriptions(subs, json);
  } catch (err) {
    logger.error("deliverPush failed", err);
  }
}

type StoredSubscription = typeof pushSubscriptions.$inferSelect;

/**
 * Send an encoded payload to every given subscription. Prunes subscriptions
 * that the push service reports gone (404/410) or that fail repeatedly, and
 * returns how many devices the send reached. Never throws.
 */
async function sendToSubscriptions(
  subs: StoredSubscription[],
  json: string
): Promise<{ sent: number; failed: number }> {
  const results = await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          json,
          { TTL: 86_400, urgency: "high", timeout: 10_000 }
        );
      } catch (err) {
        const e = err as { statusCode?: number; body?: string };
        const code = e.statusCode;
        if (code === 404 || code === 410) {
          await db
            .delete(pushSubscriptions)
            .where(eq(pushSubscriptions.id, s.id));
        } else {
          // Log the push service's actual rejection so a bad deploy is
          // diagnosable: 403 = VAPID key mismatch (client subscribed with a
          // different public key than the server's private key), 400 = bad
          // JWT/subject. Log only the endpoint host — never the full URL, which
          // is a bearer token.
          let host = "";
          try {
            host = new URL(s.endpoint).host;
          } catch {
            /* ignore */
          }
          logger.warn("web push send failed", {
            statusCode: code ?? null,
            host,
            body: e.body,
          });
          const next = s.failureCount + 1;
          if (next >= 5) {
            await db
              .delete(pushSubscriptions)
              .where(eq(pushSubscriptions.id, s.id));
          } else {
            await db
              .update(pushSubscriptions)
              .set({ failureCount: next })
              .where(eq(pushSubscriptions.id, s.id));
          }
        }
        throw err; // surface as a rejected settle so counts are accurate
      }
    })
  );
  let sent = 0;
  let failed = 0;
  for (const result of results) {
    if (result.status === "fulfilled") sent++;
    else failed++;
  }
  return { sent, failed };
}

/**
 * Send an immediate test notification to all of a user's devices, deliberately
 * **bypassing** the schedule/quiet-hours/pause gate so the test always arrives
 * and truthfully verifies the delivery pipe. Best-effort: never throws.
 */
export async function deliverTestPush(
  userId: string
): Promise<{ configured: boolean; devices: number; sent: number; failed: number }> {
  if (!configure()) return { configured: false, devices: 0, sent: 0, failed: 0 };
  try {
    const subs = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));
    if (subs.length === 0) {
      return { configured: true, devices: 0, sent: 0, failed: 0 };
    }
    const unread = await getUnreadCount(userId);
    const json = JSON.stringify({
      title: "Test notification",
      body: "Push is working on this device.",
      url: "/settings/notifications",
      tag: "test",
      unread,
    });
    const { sent, failed } = await sendToSubscriptions(subs, json);
    return { configured: true, devices: subs.length, sent, failed };
  } catch (err) {
    logger.error("deliverTestPush failed", err);
    return { configured: true, devices: 0, sent: 0, failed: 0 };
  }
}

type IncomingSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

/** Upsert a browser subscription for a user (idempotent on endpoint). */
export async function saveSubscription(
  userId: string,
  sub: IncomingSubscription,
  userAgent?: string
): Promise<void> {
  await db
    .insert(pushSubscriptions)
    .values({
      userId,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      userAgent: userAgent ?? null,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        userAgent: userAgent ?? null,
        failureCount: 0,
        lastSeenAt: new Date(),
      },
    });
}

export async function removeSubscription(
  endpoint: string,
  userId: string
): Promise<void> {
  await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.endpoint, endpoint),
        eq(pushSubscriptions.userId, userId)
      )
    );
}
