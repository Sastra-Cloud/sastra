/**
 * Pure scheduling helpers for the cron tick. Everything here takes explicit
 * inputs so the due-time rules can be unit tested without a database.
 */
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/** How long a `running_since` lease is honored before another tick may take over. */
export const LEASE_STALE_MS = 30 * MINUTE_MS;

export type WorkSchedule = {
  timezone: string;
  /** 0=Sun..6=Sat */
  workDays: number[];
  /** Minutes of day in the workspace timezone. */
  workHoursStart: number;
  workHoursEnd: number;
};

/** Add `ms` to `date`. */
export function addMs(date: Date, ms: number): Date {
  return new Date(date.getTime() + ms);
}

/** Earliest of the given dates, ignoring `null`. */
export function earliest(...dates: Array<Date | null | undefined>): Date | null {
  let min: Date | null = null;
  for (const d of dates) {
    if (d && (!min || d.getTime() < min.getTime())) min = d;
  }
  return min;
}

/**
 * Interval-based due time: `lastRunAt + interval`, or `now` when the job has
 * never run. Never returns a time in the past, so callers can compare with `<=`.
 */
export function intervalDue(
  now: Date,
  lastRunAt: Date | null | undefined,
  intervalMs: number
): Date {
  if (!lastRunAt) return now;
  const due = addMs(lastRunAt, intervalMs);
  return due.getTime() < now.getTime() ? now : due;
}

function localParts(date: Date, timezone: string) {
  return {
    day: Number(formatInTimeZone(date, timezone, "i")) % 7, // 0=Sun..6=Sat
    minutes:
      Number(formatInTimeZone(date, timezone, "H")) * 60 +
      Number(formatInTimeZone(date, timezone, "m")),
    ymd: formatInTimeZone(date, timezone, "yyyy-MM-dd"),
  };
}

/** Whether `date` falls on a work day inside [workHoursStart, workHoursEnd). */
export function isWithinWorkHours(date: Date, schedule: WorkSchedule): boolean {
  const { day, minutes } = localParts(date, schedule.timezone);
  return (
    schedule.workDays.includes(day) &&
    minutes >= schedule.workHoursStart &&
    minutes < schedule.workHoursEnd
  );
}

/**
 * The next instant at which the local wall-clock time is `HH:mm` on one of
 * `days` (0=Sun..6=Sat), strictly after `after`. Walks day by day, so daylight
 * saving changes are handled by the timezone library.
 */
export function nextLocalOccurrence(
  after: Date,
  timezone: string,
  time: string,
  days: number[] = [0, 1, 2, 3, 4, 5, 6]
): Date {
  const [hh, mm] = time.split(":").map((n) => Number(n) || 0);
  const clock = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`;
  for (let offset = 0; offset <= 8; offset += 1) {
    const probe = addMs(after, offset * DAY_MS);
    const { ymd, day } = localParts(probe, timezone);
    if (!days.includes(day)) continue;
    const candidate = fromZonedTime(`${ymd}T${clock}`, timezone);
    if (candidate.getTime() > after.getTime()) return candidate;
  }
  // Unreachable with a non-empty `days`; fall back to a day from now.
  return addMs(after, DAY_MS);
}

/** The next work-hours start after `after` (or `after` itself when inside). */
export function nextWorkHoursStart(after: Date, schedule: WorkSchedule): Date {
  if (isWithinWorkHours(after, schedule)) return after;
  const time = `${String(Math.floor(schedule.workHoursStart / 60)).padStart(2, "0")}:${String(
    schedule.workHoursStart % 60
  ).padStart(2, "0")}`;
  const days = schedule.workDays.length ? schedule.workDays : [1, 2, 3, 4, 5];
  return nextLocalOccurrence(after, schedule.timezone, time, days);
}

/**
 * A polling job that runs every `busyMs` during work hours and every `idleMs`
 * outside them. Outside work hours the idle cadence still applies, so a
 * message that arrives at night is picked up within `idleMs`.
 */
export function pollingDue(
  now: Date,
  lastRunAt: Date | null | undefined,
  schedule: WorkSchedule,
  busyMs: number,
  idleMs: number
): Date {
  if (!lastRunAt) return now;
  const inWork = isWithinWorkHours(now, schedule);
  const due = intervalDue(now, lastRunAt, inWork ? busyMs : idleMs);
  if (inWork) return due;
  // Outside work hours: whichever comes first, the idle interval or the start
  // of the next work window.
  return earliest(due, nextWorkHoursStart(now, schedule)) ?? due;
}

/**
 * A daily job anchored to a local time: due at the next `time` after the last
 * run, or now when it has never run. Runs that were missed (the instance was
 * down) are caught up on the next tick.
 */
export function dailyDue(
  now: Date,
  lastRunAt: Date | null | undefined,
  timezone: string,
  time: string
): Date {
  if (!lastRunAt) return now;
  const next = nextLocalOccurrence(lastRunAt, timezone, time);
  return next.getTime() < now.getTime() ? now : next;
}

/**
 * The weekly digest window is one local hour on one weekday. Returns the start
 * of the next window strictly after `after`.
 */
export function nextWeeklyWindow(
  after: Date,
  timezone: string,
  weekday: number,
  time: string
): Date {
  const [hh] = time.split(":");
  return nextLocalOccurrence(after, timezone, `${hh}:00`, [weekday]);
}

/** Whether `date` is inside the weekly digest window. */
export function isInWeeklyWindow(
  date: Date,
  timezone: string,
  weekday: number,
  time: string
): boolean {
  const { day, minutes } = localParts(date, timezone);
  const [hh] = time.split(":");
  return day === weekday && Math.floor(minutes / 60) === Number(hh);
}

/** Same local calendar hour, used to avoid sending the digest twice in a window. */
export function sameLocalHour(a: Date, b: Date, timezone: string): boolean {
  return (
    formatInTimeZone(a, timezone, "yyyy-MM-dd HH") ===
    formatInTimeZone(b, timezone, "yyyy-MM-dd HH")
  );
}
