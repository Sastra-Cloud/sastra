import "server-only";

import { and, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { projects, rightsItems, tasks } from "@/lib/db/schema";
import { getWorkspaceSettings } from "@/lib/workspace/queries";
import type { ProjectKind } from "@/lib/projects/kinds";
import type { DurationByKind } from "@/lib/planning/capacity";
import {
  DEFAULT_CAPACITY_GROUPS,
  normalizeGroups,
  type CapacityGroup,
} from "@/lib/planning/groups";

/**
 * Workspace planning defaults: capacity groups (work paths, each with its own
 * concurrency), typical duration per kind, and a flat concurrency kept for
 * back-compat callers. Groups are normalized so every kind maps to exactly one.
 */
export async function getPlanningDefaults(): Promise<{
  concurrency: number;
  groups: CapacityGroup[];
  durationByKind: DurationByKind;
}> {
  const s = await getWorkspaceSettings();
  const groups = normalizeGroups(
    (s.capacityGroups as CapacityGroup[] | null | undefined)?.length
      ? (s.capacityGroups as CapacityGroup[])
      : DEFAULT_CAPACITY_GROUPS
  );
  return {
    concurrency: s.projectsConcurrent,
    groups,
    durationByKind: {
      book: s.durationMonthsBook,
      article: s.durationMonthsArticle,
      podcast: s.durationMonthsPodcast,
      video_series: s.durationMonthsVideoSeries,
      other: s.durationMonthsOther,
    },
  };
}

/**
 * Active/planning projects (excluding the given one) with the fields needed to
 * derive each project's expected finish for the capacity model. Grouped by
 * project so a project with several rights items is counted once (the tightest
 * `completeByDate` is used as the fallback deadline).
 */
export async function listInFlightForPlanning(excludeProjectId: string) {
  return db
    .select({
      id: projects.id,
      name: projects.title,
      startDate: projects.startDate,
      dueDate: projects.dueDate,
      kind: projects.kind,
      status: projects.status,
      estimatedDurationMonths: projects.estimatedDurationMonths,
      completeByDate: sql<string | null>`min(${rightsItems.completeByDate})`,
    })
    .from(projects)
    .leftJoin(rightsItems, eq(rightsItems.projectId, projects.id))
    .where(
      and(
        inArray(projects.status, ["planning", "active"]),
        ne(projects.id, excludeProjectId)
      )
    )
    .groupBy(projects.id);
}

/**
 * Average actual duration (months) of completed projects of a kind, using the
 * last completed task as the real finish. Null when there's too little data
 * (< 2 projects) to be a useful calibration hint. No AI — just history.
 */
export async function historicalDurationHint(
  kind: ProjectKind
): Promise<{ count: number; avgMonths: number } | null> {
  const rows = await db
    .select({
      startDate: projects.startDate,
      finishedAt: sql<string | null>`max(${tasks.completedAt})::text`,
    })
    .from(projects)
    .leftJoin(tasks, eq(tasks.projectId, projects.id))
    .where(
      and(
        eq(projects.status, "completed"),
        eq(projects.kind, kind),
        isNotNull(projects.startDate)
      )
    )
    .groupBy(projects.id, projects.startDate);

  const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.44;
  const durations: number[] = [];
  for (const row of rows) {
    if (!row.startDate || !row.finishedAt) continue;
    const months =
      (new Date(row.finishedAt).getTime() - new Date(row.startDate).getTime()) /
      MS_PER_MONTH;
    if (months > 0 && months < 240) durations.push(months);
  }
  if (durations.length < 2) return null;
  const avg = durations.reduce((sum, m) => sum + m, 0) / durations.length;
  return { count: durations.length, avgMonths: Math.round(avg) };
}
