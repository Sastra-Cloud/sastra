/** Pure helpers for the admin usage report (no DB) so they're unit-testable. */

import { monthStartUtc } from "./budget-math";

export type UsageRange = "month" | "90d" | "all";

export type ResolvedRange = {
  range: UsageRange;
  /** Inclusive lower bound on created_at; null means all time. */
  start: Date | null;
  /** Time-series bucket granularity for the spend-over-time chart. */
  bucket: "day" | "month";
  label: string;
};

export const RANGE_OPTIONS: { key: UsageRange; label: string }[] = [
  { key: "month", label: "This month" },
  { key: "90d", label: "Last 3 months" },
  { key: "all", label: "All time" },
];

/** Coerce an untrusted query-param string into a valid range (defaults to month). */
export function parseRange(raw: string | undefined | null): UsageRange {
  return raw === "90d" || raw === "all" ? raw : "month";
}

export function resolveRange(range: UsageRange, now: Date): ResolvedRange {
  if (range === "all") {
    return { range, start: null, bucket: "month", label: "All time" };
  }
  if (range === "90d") {
    const start = new Date(now);
    start.setUTCDate(start.getUTCDate() - 90);
    start.setUTCHours(0, 0, 0, 0);
    return { range, start, bucket: "day", label: "Last 3 months" };
  }
  return { range, start: monthStartUtc(now), bucket: "day", label: "This month" };
}

/** Compact USD formatting for report tiles/tables (e.g. $0.24, $12.30). */
export function formatUsd(n: number): string {
  return `$${(n ?? 0).toFixed(2)}`;
}

/** Compact token counts (e.g. 940, 12.3k, 4.1M). */
export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}
