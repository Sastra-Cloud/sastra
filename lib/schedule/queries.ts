import "server-only";

import { asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { projects, rightsItems } from "@/lib/db/schema";

export type ScheduleProjectRow = {
  id: string;
  slug: string;
  title: string;
  kind: string | null;
  videoProductionMode: string | null;
  status: string;
  priority: string;
  healthStatus: string | null;
  startDate: string | null;
  estimatedDurationMonths: number | null;
  dueDate: string | null;
  completeByDate: string | null;
  taskCount: number;
};

/**
 * Active/planning projects for the schedule board: the planning fields (start,
 * estimated duration), the contractual deadline (its own due date or a signed
 * agreement's), and a task count (so we only offer to shift tasks when there
 * are any). Ordered by start date (unscheduled last), then title.
 */
export async function listPortfolioSchedule(): Promise<ScheduleProjectRow[]> {
  return db
    .select({
      id: projects.id,
      slug: projects.slug,
      title: projects.title,
      kind: projects.kind,
      videoProductionMode: projects.videoProductionMode,
      status: projects.status,
      priority: projects.priority,
      healthStatus: projects.healthStatus,
      startDate: projects.startDate,
      estimatedDurationMonths: projects.estimatedDurationMonths,
      dueDate: projects.dueDate,
      // Grouped so a project with several rights items appears once (tightest
      // complete-by wins), instead of duplicating on the roadmap.
      completeByDate: sql<string | null>`min(${rightsItems.completeByDate})`,
      taskCount: sql<number>`(select count(*)::int from tasks t where t.project_id = ${projects.id})`,
    })
    .from(projects)
    .leftJoin(rightsItems, eq(rightsItems.projectId, projects.id))
    .where(inArray(projects.status, ["planning", "active"]))
    .groupBy(projects.id)
    .orderBy(
      sql`${projects.startDate} asc nulls last`,
      asc(projects.title)
    );
}
