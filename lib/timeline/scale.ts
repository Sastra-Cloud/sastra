/**
 * Pure date-scale math for the interactive Gantt. Maps yyyy-mm-dd dates to
 * pixel offsets at a given px-per-day density, produces month gridlines, and
 * converts drag pixel deltas back to whole-day deltas. No DOM, no DB.
 */

const DAY_MS = 86_400_000;

export function ymdToMs(ymd: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

export function msToYmd(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDaysYmd(ymd: string, days: number): string {
  const ms = ymdToMs(ymd);
  if (ms === null) return ymd;
  return msToYmd(ms + days * DAY_MS);
}

export type MonthTick = { x: number; label: string };

export type GanttScale = {
  minYmd: string;
  maxYmd: string;
  spanDays: number;
  pxPerDay: number;
  /** Total content width in px. */
  width: number;
  /** X offset in px for a date (clamped into range). */
  x: (ymd: string) => number;
  months: MonthTick[];
};

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Build the scale over [minYmd, maxYmd] (inclusive) at pxPerDay. Month ticks
 * are placed at the 1st of each month inside the range (plus the range start).
 */
export function buildScale(input: {
  minYmd: string;
  maxYmd: string;
  pxPerDay: number;
}): GanttScale {
  const minMs = ymdToMs(input.minYmd) ?? Date.UTC(2000, 0, 1);
  const maxMsRaw = ymdToMs(input.maxYmd) ?? minMs + 30 * DAY_MS;
  const maxMs = Math.max(maxMsRaw, minMs + DAY_MS);
  const spanDays = Math.round((maxMs - minMs) / DAY_MS);
  const pxPerDay = Math.max(0.1, input.pxPerDay);
  const width = spanDays * pxPerDay;

  const x = (ymd: string) => {
    const ms = ymdToMs(ymd);
    if (ms === null) return 0;
    const clamped = Math.min(Math.max(ms, minMs), maxMs);
    return ((clamped - minMs) / DAY_MS) * pxPerDay;
  };

  const months: MonthTick[] = [];
  const start = new Date(minMs);
  // First tick at the start of the range.
  months.push({
    x: 0,
    label: `${MONTHS[start.getUTCMonth()]} ${start.getUTCFullYear()}`,
  });
  // Then every 1st-of-month strictly inside the range.
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  while (cursor.getTime() < maxMs) {
    months.push({
      x: ((cursor.getTime() - minMs) / DAY_MS) * pxPerDay,
      label: `${MONTHS[cursor.getUTCMonth()]}${cursor.getUTCMonth() === 0 ? ` ${cursor.getUTCFullYear()}` : ""}`,
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return { minYmd: msToYmd(minMs), maxYmd: msToYmd(maxMs), spanDays, pxPerDay, width, x, months };
}

/** Convert a drag distance in px to a whole-day delta (round to nearest day). */
export function pxToDayDelta(px: number, pxPerDay: number): number {
  if (pxPerDay <= 0) return 0;
  return Math.round(px / pxPerDay);
}

/**
 * The date range a Gantt should show: everything with a date, plus today,
 * padded so bars never touch the edges.
 */
export function ganttRange(
  dates: (string | null | undefined)[],
  today: string,
  pad: { before: number; after: number } = { before: 7, after: 14 }
): { minYmd: string; maxYmd: string } {
  const all = dates.filter((d): d is string => !!d && ymdToMs(d) !== null);
  all.push(today);
  let min = all[0];
  let max = all[0];
  for (const d of all) {
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return {
    minYmd: addDaysYmd(min, -pad.before),
    maxYmd: addDaysYmd(max, pad.after),
  };
}
