import "server-only";

import { and, asc, eq, gte, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { projectSnapshots } from "@/lib/db/schema";
import {
  listProjectBlockerSummaries,
  listProjectBudgetTotals,
  listProjects,
} from "@/lib/projects/queries";

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Write one snapshot row per project for `snapDate` (idempotent — re-running the
 * cron the same day is a no-op). Called daily after blockers are recomputed.
 */
export async function writeProjectSnapshots(snapDate = todayYmd()): Promise<number> {
  const [projects, blockerSummaries, budgetTotals] = await Promise.all([
    listProjects(),
    listProjectBlockerSummaries(),
    listProjectBudgetTotals(),
  ]);
  if (projects.length === 0) return 0;

  const critMap = new Map(blockerSummaries.map((b) => [b.projectId, b.critical]));
  const budgetMap = new Map(budgetTotals.map((b) => [b.projectId, b]));

  await db
    .insert(projectSnapshots)
    .values(
      projects.map((p) => ({
        projectId: p.id,
        snapDate,
        healthStatus: p.healthStatus,
        totalTasks: p.totalTasks,
        doneTasks: p.doneTasks,
        blockerCount: p.blockerCount,
        criticalBlockerCount: critMap.get(p.id) ?? 0,
        budgetNeeded: String(budgetMap.get(p.id)?.needed ?? 0),
        budgetSecured: String(budgetMap.get(p.id)?.secured ?? 0),
      }))
    )
    .onConflictDoNothing({
      target: [projectSnapshots.projectId, projectSnapshots.snapDate],
    });
  return projects.length;
}

export type SnapshotPoint = {
  date: string;
  doneTasks: number;
  totalTasks: number;
  blockerCount: number;
  budgetNeeded: number;
  budgetSecured: number;
};

/** A project's recent daily snapshots (oldest → newest) for trend charts. */
export async function getProjectSnapshots(
  projectId: string,
  days = 30
): Promise<SnapshotPoint[]> {
  const rows = await db
    .select({
      date: projectSnapshots.snapDate,
      doneTasks: projectSnapshots.doneTasks,
      totalTasks: projectSnapshots.totalTasks,
      blockerCount: projectSnapshots.blockerCount,
      budgetNeeded: projectSnapshots.budgetNeeded,
      budgetSecured: projectSnapshots.budgetSecured,
    })
    .from(projectSnapshots)
    .where(
      and(
        eq(projectSnapshots.projectId, projectId),
        gte(
          projectSnapshots.snapDate,
          sql`(current_date - ${days} * interval '1 day')`
        )
      )
    )
    .orderBy(asc(projectSnapshots.snapDate));

  return rows.map((r) => ({
    date: r.date,
    doneTasks: r.doneTasks,
    totalTasks: r.totalTasks,
    blockerCount: r.blockerCount,
    budgetNeeded: Number(r.budgetNeeded),
    budgetSecured: Number(r.budgetSecured),
  }));
}
