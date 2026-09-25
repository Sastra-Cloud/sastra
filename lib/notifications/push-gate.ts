/**
 * Pure push-delivery gating (no DB) — decides whether a given notification type
 * should push to a user *right now*, honoring tz-aware quiet hours, presence,
 * and an out-of-office pause. Email category opt-outs never affect push.
 */

export type PushPrefs = {
  quietHoursEnabled: boolean;
  quietHoursStart: number; // minutes of day (0–1439), user-local
  quietHoursEnd: number;
  pushPausedUntil: Date | null;
  // When true, only deliver while the user is actively present in the app.
  pushOnlyWhenActive: boolean;
  pushReviewSuggestions: boolean;
};

const REVIEW_SUGGESTION_TYPES = new Set([
  "possible_new_project",
  "possible_counterparty",
  "possible_grant_reminder",
  "possible_project_update",
  "email_task_suggested",
]);

/** Minutes-of-day (0–1439) for `now` in the given IANA timezone. */
export function minutesOfDayInTz(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
}

/** True if `mins` falls in [start, end), handling overnight windows (start > end). */
export function withinQuietHours(mins: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? mins >= start && mins < end : mins >= start || mins < end;
}

export function shouldDeliverPush(
  prefs: PushPrefs,
  type: string,
  now: Date,
  timeZone: string,
  isActive = true
): boolean {
  if (REVIEW_SUGGESTION_TYPES.has(type) && !prefs.pushReviewSuggestions) {
    return false;
  }
  if (prefs.pushOnlyWhenActive && !isActive) return false;
  if (prefs.pushPausedUntil && now < prefs.pushPausedUntil) return false;
  if (prefs.quietHoursEnabled) {
    const mins = minutesOfDayInTz(now, timeZone || "UTC");
    if (withinQuietHours(mins, prefs.quietHoursStart, prefs.quietHoursEnd)) {
      return false;
    }
  }
  return true;
}
