import { addDays, format } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export const EMAIL_DELIVERY_MODES = ["bundled", "daily", "immediate"] as const;
export type EmailDeliveryMode = (typeof EMAIL_DELIVERY_MODES)[number];
export type NotificationEmailCategory = "workflow" | "standup";

const EMAIL_DISABLED_NOTIFICATION_TYPES = new Set([
  "email_received",
  "email_task_created",
  "email_task_suggested",
  "possible_new_project",
  "possible_counterparty",
  "possible_grant_reminder",
  "possible_project_update",
]);

/** Correspondence intake stays in-app/push-only even if a caller omits email:false. */
export function notificationTypeCanEmail(type: string): boolean {
  return !EMAIL_DISABLED_NOTIFICATION_TYPES.has(type);
}

/** Direct mentions are person-to-person requests, so they bypass digest delay. */
export function notificationTypeSendsImmediately(type: string): boolean {
  return type === "mention" || type.endsWith("_mention");
}

export const DEFAULT_DIGEST_TIME_MINUTES = 8 * 60;
export const BUNDLE_WINDOW_MINUTES = 5;

export function notificationEmailCategory(type: string): NotificationEmailCategory {
  return type === "standup_digest" ? "standup" : "workflow";
}

export function categoryEnabled(
  category: NotificationEmailCategory,
  prefs: { workflowOptIn: boolean; standupOptIn: boolean }
): boolean {
  return category === "standup" ? prefs.standupOptIn : prefs.workflowOptIn;
}

export function nextBundleBoundary(now: Date): Date {
  const windowMs = BUNDLE_WINDOW_MINUTES * 60_000;
  return new Date((Math.floor(now.getTime() / windowMs) + 1) * windowMs);
}

function safeTimezone(timezone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    return timezone;
  } catch {
    return "UTC";
  }
}

/** Next Monday-Friday delivery at the configured user-local time. */
export function nextDailyDigest(
  now: Date,
  timezone: string,
  minutes = DEFAULT_DIGEST_TIME_MINUTES
): Date {
  const timeZone = safeTimezone(timezone);
  const clamped = Math.min(1439, Math.max(0, Math.trunc(minutes)));
  const hour = String(Math.floor(clamped / 60)).padStart(2, "0");
  const minute = String(clamped % 60).padStart(2, "0");
  let localDate = formatInTimeZone(now, timeZone, "yyyy-MM-dd");

  for (let offset = 0; offset < 8; offset += 1) {
    const candidate = fromZonedTime(`${localDate}T${hour}:${minute}:00`, timeZone);
    const weekday = Number(formatInTimeZone(candidate, timeZone, "i"));
    if (weekday <= 5 && candidate.getTime() > now.getTime()) return candidate;
    localDate = format(addDays(new Date(`${localDate}T12:00:00Z`), 1), "yyyy-MM-dd");
  }

  // The loop always finds a weekday, but keep a deterministic fallback.
  return new Date(now.getTime() + 24 * 60 * 60_000);
}

export function notificationEmailDeliveryAt({
  mode,
  now,
  timezone,
  digestTimeMinutes,
  type,
}: {
  mode: EmailDeliveryMode;
  now: Date;
  timezone: string;
  digestTimeMinutes: number;
  type?: string;
}): Date {
  if (type && notificationTypeSendsImmediately(type)) return now;
  if (mode === "immediate") return now;
  if (mode === "daily") {
    return nextDailyDigest(now, timezone, digestTimeMinutes);
  }
  return nextBundleBoundary(now);
}

export function retryDeliveryAt(now: Date, attemptCount: number): Date {
  const delayMinutes = Math.min(360, 5 * 2 ** Math.max(0, attemptCount - 1));
  return new Date(now.getTime() + delayMinutes * 60_000);
}
