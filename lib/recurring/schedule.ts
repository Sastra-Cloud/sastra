/**
 * Pure recurrence date math (no DB, no timezone state) so it's unit-testable.
 * All dates are `YYYY-MM-DD` strings in UTC, matching the rest of the app
 * (tasks.dueDate, `todayIso()`). Occurrences are always computed from the
 * anchor (anchor + k intervals) — never chained — so month-end days don't drift
 * (e.g. a Jan-31 monthly rule yields Feb-28 then Mar-31, not Mar-28).
 */

export type Frequency = "weekly" | "monthly" | "quarterly" | "annual";
export const FREQUENCIES: Frequency[] = [
  "weekly",
  "monthly",
  "quarterly",
  "annual",
];

function parseYmd(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split("-").map(Number);
  return { y, m, d };
}

function fmt(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Days in month `m` (1-based) of year `y`. */
function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function addMonthsClamped(
  y: number,
  m: number,
  d: number,
  months: number
): string {
  const total = m - 1 + months;
  const ny = y + Math.floor(total / 12);
  const nm = ((total % 12) + 12) % 12 + 1;
  const nd = Math.min(d, lastDayOfMonth(ny, nm));
  return fmt(ny, nm, nd);
}

/** The k-th occurrence (k >= 0) of a rule, computed from the anchor. */
export function occurrenceDate(
  anchor: string,
  frequency: Frequency,
  k: number
): string {
  const { y, m, d } = parseYmd(anchor);
  if (frequency === "weekly") {
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + 7 * k);
    return fmt(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  const step = frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : 12;
  return addMonthsClamped(y, m, d, step * k);
}

/**
 * The next occurrence due date on or after `today` (and on/before `endDate` if
 * set), or null if the rule has ended. This is what the generator materializes
 * eagerly — so a recurring task always exists ahead of its due date.
 */
export function nextDueDate(
  anchor: string,
  frequency: Frequency,
  today: string,
  endDate?: string | null
): string | null {
  const CAP = 6000; // ~115 years of weeks; bounds a dormant rule's scan
  for (let k = 0; k < CAP; k++) {
    const occ = occurrenceDate(anchor, frequency, k);
    if (occ >= today) {
      if (endDate && occ > endDate) return null;
      return occ;
    }
  }
  return null;
}

/**
 * First-due date for a periodic report reminder. An explicit "first report due"
 * date wins. Annual agreement reports otherwise use January 31 of the following
 * calendar year, which groups yearly compliance work into a predictable closeout
 * period instead of using an arbitrary signing anniversary. Other cadences are
 * due one full period after signing/start (falling back to `today`).
 */
export function reportReminderAnchor(
  frequency: Frequency,
  opts: { explicit?: string | null; signedDate?: string | null; today: string }
): string {
  if (opts.explicit) return opts.explicit;
  const base = opts.signedDate || opts.today;
  if (frequency === "annual") {
    const year = Number(base.slice(0, 4));
    return `${year + 1}-01-31`;
  }
  return occurrenceDate(base, frequency, 1);
}

/** A stable period key from a due date + cadence (for royalty payment dedupe/labels). */
export function periodKey(dueDate: string, frequency: Frequency): string {
  const { y, m } = parseYmd(dueDate);
  if (frequency === "annual") return `${y}`;
  if (frequency === "quarterly") return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
  if (frequency === "monthly") return `${y}-${String(m).padStart(2, "0")}`;
  // weekly isn't used by royalties, but keep it total.
  return dueDate;
}
