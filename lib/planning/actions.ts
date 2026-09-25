"use server";

import { eq } from "drizzle-orm";

import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import {
  durationForKind,
  type DurationByKind,
} from "@/lib/planning/capacity";
import {
  getPlanningDefaults,
  historicalDurationHint,
  listInFlightForPlanning,
} from "@/lib/planning/queries";
import { groupForKind } from "@/lib/planning/groups";

/** A committed book on the path — raw fields so the client can assess it. */
export type PlanningBook = {
  id: string;
  name: string;
  status: string;
  /** Real committed start (in production); null means not started yet. */
  startDate: string | null;
  /** Contractual deadline (complete-by, else project due date). */
  deadline: string | null;
  kind: string | null;
  estimatedDurationMonths: number | null;
  /** True when the deadline comes from a signed agreement (firmer). */
  committed: boolean;
};

export type CompletionPlanningData = {
  today: string;
  projectKind: string | null;
  /** The work path this project competes in (its concurrency scopes the slots). */
  groupName: string;
  concurrency: number;
  durationByKind: DurationByKind;
  /** Default duration for this project's kind. */
  durationMonths: number;
  /** Committed books on this path (started or dated). */
  books: PlanningBook[];
  /** Same-path projects with no due date; not shown in the deadline list. */
  dormantCount: number;
  /** Average actual months for completed projects of this kind, if enough data. */
  historical: { count: number; avgMonths: number } | null;
};

/**
 * Everything the completion-date planner needs to suggest a realistic date for
 * `projectId`. Capacity is scoped to the project's *work path*: only in-flight
 * projects on the same path compete for its slots, and the path's own
 * concurrency (not a global number) sizes the slot count. Read-only — the
 * client computes suggestions from this locally.
 */
export async function getCompletionPlanningData(
  projectId: string
): Promise<CompletionPlanningData | null> {
  await requireRole("manager");
  const [project] = await db
    .select({ kind: projects.kind })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return null;

  const today = new Date().toISOString().slice(0, 10);
  const defaults = await getPlanningDefaults();
  const group = groupForKind(defaults.groups, project.kind);
  const rows = await listInFlightForPlanning(projectId);
  const samePath = rows.filter(
    (r) => groupForKind(defaults.groups, r.kind)?.key === group?.key
  );
  // A book counts if it's in production (active/started) OR carries a committed
  // due date. Only same-path projects with no start AND no due date sit outside.
  const hasDeadline = (r: (typeof samePath)[number]) =>
    r.completeByDate != null || r.dueDate != null;
  const counted = samePath.filter(
    (r) => r.status === "active" || r.startDate != null || hasDeadline(r)
  );
  const books: PlanningBook[] = counted.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    startDate: r.startDate,
    deadline: r.completeByDate ?? r.dueDate,
    kind: r.kind,
    estimatedDurationMonths: r.estimatedDurationMonths,
    committed: r.completeByDate != null,
  }));

  return {
    today,
    projectKind: project.kind,
    groupName: group?.name ?? "All projects",
    concurrency: group?.concurrency ?? defaults.concurrency,
    durationByKind: defaults.durationByKind,
    durationMonths: durationForKind(defaults.durationByKind, project.kind),
    books,
    // Same-path projects with no due date (and not in production).
    dormantCount: samePath.filter((r) => !hasDeadline(r) && r.startDate == null && r.status !== "active").length,
    historical: project.kind ? await historicalDurationHint(project.kind) : null,
  };
}
