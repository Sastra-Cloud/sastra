/**
 * Pure capacity/scheduling math for suggesting a realistic project completion
 * date. No DB, no `window`, no `"use server"` — so it's unit-testable and safe
 * to import on the client (the interactive planner runs it live).
 *
 * The model: the team runs a fixed number of projects at once (`concurrency`).
 * A new project can't start until a slot frees, i.e. until enough in-flight
 * projects finish. Suggested completion = when the slot opens + the typical
 * duration for the project's kind.
 */

import type { ProjectKind } from "@/lib/projects/kinds";

/** Typical start-to-finish months, per project kind. */
export type DurationByKind = Record<ProjectKind, number>;

// --- date-only helpers (no timezone: constructed and read in local components) ---

function toYmd(dt: Date): string {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Add whole months to a `YYYY-MM-DD` date (month overflow normalizes). */
export function addMonths(ymd: string, months: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return toYmd(new Date(y, m - 1 + months, d));
}

/** Typical duration for a project kind, falling back to the "other" default. */
export function durationForKind(
  durations: DurationByKind,
  kind: string | null | undefined
): number {
  if (kind && kind in durations) return durations[kind as ProjectKind];
  // Untyped projects are treated as books (the primary kind).
  return durations.book;
}

/**
 * A project's *planned* end — when we intend to finish, given a start and a
 * duration (the explicit override, else the workspace per-kind default). Null
 * when the project isn't scheduled yet (no start). Distinct from the
 * contractual deadline (dueDate / completeByDate).
 */
export function plannedEnd(
  project: {
    startDate: string | null;
    estimatedDurationMonths: number | null;
    kind: string | null;
  },
  durations: DurationByKind
): string | null {
  if (!project.startDate) return null;
  const months = project.estimatedDurationMonths ?? durationForKind(durations, project.kind);
  return addMonths(project.startDate, months);
}

/**
 * The best expected finish for an in-flight project — i.e. when it frees its
 * slot. The *plan* wins: if the project is scheduled (has a start), that's
 * start + duration. Only when it isn't scheduled do we fall back to the
 * contractual deadline (which is often a shared placeholder), then to
 * today + typical duration. This is what stops a batch of imported projects
 * from piling on one placeholder date.
 */
export function deriveExpectedFinish(
  project: {
    startDate: string | null;
    dueDate: string | null;
    completeByDate: string | null;
    kind: string | null;
    estimatedDurationMonths: number | null;
  },
  durations: DurationByKind,
  today: string
): string {
  const planned = plannedEnd(project, durations);
  if (planned) return planned;
  if (project.completeByDate) return project.completeByDate;
  if (project.dueDate) return project.dueDate;
  return addMonths(today, durationForKind(durations, project.kind));
}

