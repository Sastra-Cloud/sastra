import "server-only";

import { cache } from "react";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { phases, projectManagers, tasks, units } from "@/lib/db/schema";
import { requireUser } from "./guards";
import { can, canInProject, type ProjectCapability } from "./policy";

/** Request-local only: revocation is checked again on every server action. */
export const listManagedProjectIds = cache(async (userId: string): Promise<string[]> => {
  const rows = await db.select({ projectId: projectManagers.projectId })
    .from(projectManagers).where(eq(projectManagers.userId, userId));
  return rows.map((row) => row.projectId);
});

export async function hasProjectCapability(
  user: { id: string; role?: string | null },
  projectId: string | null | undefined,
  capability: ProjectCapability = "project.edit"
): Promise<boolean> {
  if (can(user, capability)) return true;
  if (!projectId || !canInProject(user, capability, projectId, [projectId])) return false;
  const [grant] = await db.select({ id: projectManagers.id }).from(projectManagers)
    .where(and(eq(projectManagers.projectId, projectId), eq(projectManagers.userId, user.id)))
    .limit(1);
  return !!grant;
}

export async function requireProjectCapability(
  projectId: string | null | undefined,
  capability: ProjectCapability = "project.edit"
) {
  const session = await requireUser();
  if (!(await hasProjectCapability(session.user, projectId, capability))) {
    throw new Error("Ask a workspace manager for permission to manage this project.");
  }
  return session;
}

/** Resolve the actual owning project before authorizing a child record. */
export async function requireProjectRecord(
  kind: "task" | "phase" | "unit",
  id: string,
  capability: ProjectCapability = "project.edit"
) {
  await requireUser();
  const table = kind === "task" ? tasks : kind === "phase" ? phases : units;
  const [row] = await db.select({ projectId: table.projectId }).from(table)
    .where(eq(table.id, id)).limit(1);
  if (!row) throw new Error("This item no longer exists. Refresh and try again.");
  const session = await requireProjectCapability(row.projectId, capability);
  return { ...session, projectId: row.projectId };
}

/** Members keep control of their own work; managing others needs project authority. */
export async function requireTaskEdit(taskId: string) {
  const session = await requireUser();
  const [task] = await db.select({ projectId: tasks.projectId, assignedTo: tasks.assignedTo, createdBy: tasks.createdBy })
    .from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task) throw new Error("Task not found. Refresh and try again.");
  const ownWork = task.assignedTo === session.user.id || (!task.assignedTo && task.createdBy === session.user.id);
  if (!ownWork && !(await hasProjectCapability(session.user, task.projectId, "tasks.manage"))) {
    throw new Error("You can edit your own tasks. Ask a project manager to change this task.");
  }
  return { ...session, task };
}
