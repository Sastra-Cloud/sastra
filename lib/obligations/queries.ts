import "server-only";

import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  licenseObligations,
  recurringTasks,
  tasks,
  user,
} from "@/lib/db/schema";

export type ObligationRow = {
  id: string;
  clauseRef: string | null;
  kind: string;
  cadence: string;
  label: string;
  text: string;
  isActive: boolean;
  assigneeId: string | null;
  assigneeName: string | null;
  taskId: string | null;
  taskStatus: string | null;
  recurringTaskId: string | null;
  recurringActive: boolean | null;
};

/** All obligations for a project, with linked assignee + task/recurring state. */
export async function listObligations(
  projectId: string
): Promise<ObligationRow[]> {
  const rows = await db
    .select({
      id: licenseObligations.id,
      clauseRef: licenseObligations.clauseRef,
      kind: licenseObligations.kind,
      cadence: licenseObligations.cadence,
      label: licenseObligations.label,
      text: licenseObligations.text,
      isActive: licenseObligations.isActive,
      assigneeId: licenseObligations.assigneeId,
      assigneeName: user.name,
      taskId: licenseObligations.taskId,
      taskStatus: tasks.status,
      recurringTaskId: licenseObligations.recurringTaskId,
      recurringActive: recurringTasks.isActive,
    })
    .from(licenseObligations)
    .leftJoin(user, eq(user.id, licenseObligations.assigneeId))
    .leftJoin(tasks, eq(tasks.id, licenseObligations.taskId))
    .leftJoin(
      recurringTasks,
      eq(recurringTasks.id, licenseObligations.recurringTaskId)
    )
    .where(eq(licenseObligations.projectId, projectId))
    .orderBy(asc(licenseObligations.createdAt));
  return rows;
}

export type ComplianceSummary = {
  total: number;
  activeCount: number;
  openTaskCount: number;
};

/** Rollup for the Overview compliance badge. */
export async function getComplianceSummary(
  projectId: string
): Promise<ComplianceSummary> {
  const rows = await listObligations(projectId);
  const activeCount = rows.filter((r) => r.isActive).length;
  // "Open" = a linked gate task that isn't done yet.
  const openTaskCount = rows.filter(
    (r) => r.taskId && r.taskStatus && r.taskStatus !== "done"
  ).length;
  return { total: rows.length, activeCount, openTaskCount };
}
