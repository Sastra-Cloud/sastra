import "server-only";

import { and, eq, gte, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { projectSnapshots } from "@/lib/db/schema";
import {
  forecastCompletion,
  type ForecastSnapshot,
  type ProjectForecast,
} from "./velocity";

const HISTORY_DAYS = 35;

function isoDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function sinceDay(today: string): string {
  return new Date(Date.parse(`${today}T00:00:00Z`) - HISTORY_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

type ProjectForInput = {
  id: string;
  dueDate: string | null;
  totalTasks: number;
  doneTasks: number;
};

/** Batch forecasts for a set of projects (reuses task counts the caller has). */
export async function getProjectForecasts(
  projectsInput: ProjectForInput[],
  now = new Date()
): Promise<Map<string, ProjectForecast>> {
  const map = new Map<string, ProjectForecast>();
  const ids = projectsInput.map((p) => p.id);
  if (!ids.length) return map;

  const today = isoDay(now);
  const rows = await db
    .select({
      projectId: projectSnapshots.projectId,
      snapDate: projectSnapshots.snapDate,
      doneTasks: projectSnapshots.doneTasks,
      totalTasks: projectSnapshots.totalTasks,
    })
    .from(projectSnapshots)
    .where(
      and(
        inArray(projectSnapshots.projectId, ids),
        gte(projectSnapshots.snapDate, sinceDay(today))
      )
    );

  const byProject = new Map<string, ForecastSnapshot[]>();
  for (const r of rows) {
    const arr = byProject.get(r.projectId) ?? [];
    arr.push({ snapDate: r.snapDate, doneTasks: r.doneTasks, totalTasks: r.totalTasks });
    byProject.set(r.projectId, arr);
  }

  for (const p of projectsInput) {
    map.set(
      p.id,
      forecastCompletion({
        snapshots: byProject.get(p.id) ?? [],
        openTaskCount: Math.max(0, p.totalTasks - p.doneTasks),
        dueDate: p.dueDate,
        today,
      })
    );
  }
  return map;
}

/** Single-project forecast (blocker engine + project detail health band). */
export async function getProjectForecast(
  input: { projectId: string; dueDate: string | null; openTaskCount: number },
  now = new Date()
): Promise<ProjectForecast> {
  const today = isoDay(now);
  const rows = await db
    .select({
      snapDate: projectSnapshots.snapDate,
      doneTasks: projectSnapshots.doneTasks,
      totalTasks: projectSnapshots.totalTasks,
    })
    .from(projectSnapshots)
    .where(
      and(
        eq(projectSnapshots.projectId, input.projectId),
        gte(projectSnapshots.snapDate, sinceDay(today))
      )
    );

  return forecastCompletion({
    snapshots: rows,
    openTaskCount: input.openTaskCount,
    dueDate: input.dueDate,
    today,
  });
}
