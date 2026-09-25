/**
 * Pure capacity/utilization helpers shared by the Overview "Team load" heatmap
 * and the Workload cockpit. No DB, no server-only — safe in client components.
 *
 * Utilization = estimated open hours / weekly capacity. Color encodes urgency;
 * the number is always shown too, so color is never the sole signal.
 */

export type CapacityInput = {
  weeklyHours?: number | null;
  estHours?: number | null;
};

/** Utilization %, or null when hours/capacity are missing. */
export function utilizationPct(p: CapacityInput): number | null {
  if (!p.weeklyHours || p.weeklyHours <= 0) return null;
  if (!p.estHours || p.estHours <= 0) return null;
  return Math.round((p.estHours / p.weeklyHours) * 100);
}

export type LoadTone = "ok" | "high" | "over";

/** Over capacity (>100%), high (>80%), or ok. */
export function utilizationTone(pct: number): LoadTone {
  if (pct > 100) return "over";
  if (pct > 80) return "high";
  return "ok";
}

/** Tailwind classes for a utilization % chip. */
export function utilizationClass(pct: number): string {
  const tone = utilizationTone(pct);
  return tone === "over"
    ? "bg-destructive/15 text-destructive"
    : tone === "high"
      ? "bg-warning/20 text-warning-foreground"
      : "bg-success/15 text-success";
}

/** Threshold classes for an open-task count (task-count load signal). */
export function openLoadClass(n: number): string {
  if (n === 0) return "text-muted-foreground";
  if (n >= 9) return "bg-destructive/15 text-destructive";
  if (n >= 5) return "bg-warning/20 text-warning-foreground";
  return "";
}

/** Threshold classes for an overdue count. */
export function overdueClass(n: number): string {
  if (n === 0) return "text-muted-foreground";
  if (n >= 3) return "bg-destructive/15 text-destructive";
  return "bg-warning/20 text-warning-foreground";
}
