import "server-only";

import { and, eq, ne } from "drizzle-orm";

import { db } from "@/lib/db";
import { blockers } from "@/lib/db/schema";

function criticalFirst(a: Blocker, b: Blocker) {
  return a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1;
}

export type Blocker = {
  id: string;
  type: string;
  severity: string;
  title: string;
  sourceType: string | null;
  sourceId: string | null;
};

/** Open blockers for a project, critical first. */
export async function getProjectBlockers(projectId: string): Promise<Blocker[]> {
  const rows = await db
    .select({
      id: blockers.id,
      type: blockers.type,
      severity: blockers.severity,
      title: blockers.title,
      sourceType: blockers.sourceType,
      sourceId: blockers.sourceId,
    })
    .from(blockers)
    .where(
      and(
        eq(blockers.projectId, projectId),
        eq(blockers.isResolved, false),
        ne(blockers.type, "overdue_dependency")
      )
    );
  return rows.sort(criticalFirst);
}

/** All open blockers for every project, grouped by project (for the Portfolio Attention list). */
export async function listOpenBlockersByProject(): Promise<
  { projectId: string; blockers: Blocker[] }[]
> {
  const rows = await db
    .select({
      projectId: blockers.projectId,
      id: blockers.id,
      type: blockers.type,
      severity: blockers.severity,
      title: blockers.title,
      sourceType: blockers.sourceType,
      sourceId: blockers.sourceId,
    })
    .from(blockers)
    .where(
      and(
        eq(blockers.isResolved, false),
        ne(blockers.type, "overdue_dependency")
      )
    );

  const map = new Map<string, Blocker[]>();
  for (const r of rows) {
    const list = map.get(r.projectId) ?? [];
    list.push({
      id: r.id,
      type: r.type,
      severity: r.severity,
      title: r.title,
      sourceType: r.sourceType,
      sourceId: r.sourceId,
    });
    map.set(r.projectId, list);
  }
  return [...map.entries()].map(([projectId, bl]) => ({
    projectId,
    blockers: bl.sort(criticalFirst),
  }));
}
