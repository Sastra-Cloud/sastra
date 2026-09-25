/** Pure time-tracking helpers (no DB, client-safe). */

/** Whole seconds elapsed from a start instant to `now` (never negative). */
export function elapsedSeconds(startedAt: string | Date, now: Date): number {
  const start = typeof startedAt === "string" ? new Date(startedAt) : startedAt;
  return Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000));
}

/** Compact human duration: "1h 05m", "12m", "45s". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

/** Clock format for a live-ticking timer: "12:34" or "1:02:03". */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Hours (float) from seconds. */
export function secondsToHours(seconds: number): number {
  return seconds / 3600;
}

/** Round minutes to the nearest 15 for tidy summaries (min 0). */
export function roundTo15Min(minutes: number): number {
  return Math.max(0, Math.round(minutes / 15) * 15);
}

export type EstimateVsActual = {
  estimateHours: number | null;
  actualHours: number;
  /** actual − estimate in hours (null when there's no estimate). */
  varianceHours: number | null;
  /** actual / estimate as a %, null when no (positive) estimate. */
  pctOfEstimate: number | null;
  over: boolean;
};

/** Compare tracked time against a task's estimate. Degrades gracefully with no estimate. */
export function estimateVsActual(
  estimateHours: number | null | undefined,
  trackedSeconds: number
): EstimateVsActual {
  const actualHours = secondsToHours(trackedSeconds);
  const est = estimateHours && estimateHours > 0 ? estimateHours : null;
  return {
    estimateHours: est,
    actualHours,
    varianceHours: est === null ? null : actualHours - est,
    pctOfEstimate: est === null ? null : Math.round((actualHours / est) * 100),
    over: est !== null && actualHours > est,
  };
}
