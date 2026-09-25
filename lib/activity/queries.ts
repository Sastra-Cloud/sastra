import "server-only";

import { desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { activityLog, projects, user } from "@/lib/db/schema";

export type ActivityItem = {
  id: string;
  actorName: string | null;
  summary: string;
  createdAt: Date;
  projectTitle: string | null;
  projectSlug: string | null;
};

/** Recent activity for one project (newest first). */
export async function listProjectActivity(
  projectId: string,
  limit = 8
): Promise<ActivityItem[]> {
  const rows = await db
    .select({
      id: activityLog.id,
      actorName: user.name,
      summary: activityLog.summary,
      createdAt: activityLog.createdAt,
    })
    .from(activityLog)
    .leftJoin(user, eq(user.id, activityLog.actorId))
    .where(eq(activityLog.projectId, projectId))
    .orderBy(desc(activityLog.createdAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, projectTitle: null, projectSlug: null }));
}

/** Recent activity across the whole portfolio (newest first). */
export async function listRecentActivity(limit = 10): Promise<ActivityItem[]> {
  return db
    .select({
      id: activityLog.id,
      actorName: user.name,
      summary: activityLog.summary,
      createdAt: activityLog.createdAt,
      projectTitle: projects.title,
      projectSlug: projects.slug,
    })
    .from(activityLog)
    .leftJoin(user, eq(user.id, activityLog.actorId))
    .leftJoin(projects, eq(projects.id, activityLog.projectId))
    .orderBy(desc(activityLog.createdAt))
    .limit(limit);
}
