import "server-only";

import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { projects, tasks, timeEntries, user } from "@/lib/db/schema";

export type ActiveTimer = {
  entryId: string;
  taskId: string;
  taskTitle: string;
  projectSlug: string | null;
  /** ISO string; the client ticks elapsed from here. */
  startedAt: string;
};

/** The user's single running timer (null if none). */
export async function getActiveTimer(userId: string): Promise<ActiveTimer | null> {
  const [row] = await db
    .select({
      entryId: timeEntries.id,
      taskId: timeEntries.taskId,
      taskTitle: tasks.title,
      projectSlug: projects.slug,
      startedAt: timeEntries.startedAt,
    })
    .from(timeEntries)
    .innerJoin(tasks, eq(tasks.id, timeEntries.taskId))
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(eq(timeEntries.userId, userId), isNull(timeEntries.endedAt)))
    .limit(1);
  if (!row) return null;
  return {
    entryId: row.entryId,
    taskId: row.taskId,
    taskTitle: row.taskTitle,
    projectSlug: row.projectSlug,
    startedAt: row.startedAt.toISOString(),
  };
}

export type TimeEntryRow = {
  id: string;
  userId: string;
  userName: string | null;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  source: string;
  note: string | null;
};

/** All entries for a task (newest first) + total tracked seconds (completed entries). */
export async function getTaskTimeEntries(
  taskId: string
): Promise<{ entries: TimeEntryRow[]; totalSeconds: number }> {
  const rows = await db
    .select({
      id: timeEntries.id,
      userId: timeEntries.userId,
      userName: user.name,
      startedAt: timeEntries.startedAt,
      endedAt: timeEntries.endedAt,
      durationSeconds: timeEntries.durationSeconds,
      source: timeEntries.source,
      note: timeEntries.note,
    })
    .from(timeEntries)
    .leftJoin(user, eq(user.id, timeEntries.userId))
    .where(eq(timeEntries.taskId, taskId))
    .orderBy(desc(timeEntries.startedAt));

  const entries: TimeEntryRow[] = rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    userName: r.userName,
    startedAt: r.startedAt.toISOString(),
    endedAt: r.endedAt ? r.endedAt.toISOString() : null,
    durationSeconds: r.durationSeconds,
    source: r.source,
    note: r.note,
  }));
  const totalSeconds = entries.reduce((s, e) => s + (e.durationSeconds ?? 0), 0);
  return { entries, totalSeconds };
}

/** Total completed tracked seconds for a single task. */
export async function getTaskTrackedSeconds(taskId: string): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${timeEntries.durationSeconds}), 0)::int`,
    })
    .from(timeEntries)
    .where(eq(timeEntries.taskId, taskId));
  return Number(row?.total ?? 0);
}

/** Tracked seconds per user since `since` (completed entries), for capacity actuals. */
export async function getTeamTrackedSeconds(since: Date): Promise<Map<string, number>> {
  const rows = await db
    .select({
      userId: timeEntries.userId,
      total: sql<number>`coalesce(sum(${timeEntries.durationSeconds}), 0)::int`,
    })
    .from(timeEntries)
    .where(gte(timeEntries.startedAt, since))
    .groupBy(timeEntries.userId);
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.userId, Number(r.total));
  return map;
}

export async function getUserTrackedSeconds(
  userId: string,
  since: Date
): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${timeEntries.durationSeconds}), 0)::int`,
    })
    .from(timeEntries)
    .where(and(eq(timeEntries.userId, userId), gte(timeEntries.startedAt, since)));
  return Number(row?.total ?? 0);
}
