import "server-only";

import { and, eq, isNull, or, sql } from "drizzle-orm";

import { can } from "@/lib/auth/policy";
import { hasProjectCapability } from "@/lib/auth/project-access";
import { db } from "@/lib/db";
import { projectManagers, tasks } from "@/lib/db/schema";

type TaskActor = { id: string; role?: string | null };
type TaskTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type TaskAccess = {
  projectId: string | null;
  assignedTo: string | null;
  createdBy: string | null;
};

/** Project tasks are team-visible; standalone tasks retain their private boundary. */
export function canReadTask(user: TaskActor, task: TaskAccess) {
  return can(user, "tasks.manage") || task.projectId !== null ||
    task.assignedTo === user.id || task.createdBy === user.id;
}

/** Creating a task never grants edit authority over a later assignee's work. */
export async function canEditTask(user: TaskActor, task: TaskAccess) {
  return task.assignedTo === user.id ||
    (task.assignedTo === null && task.createdBy === user.id) ||
    await hasProjectCapability(user, task.projectId, "tasks.manage");
}

/** Recheck ownership and current grants against the actual project at the write. */
export function taskEditPredicate(taskId: string, user: TaskActor) {
  return and(eq(tasks.id, taskId), can(user, "tasks.manage") ? undefined : or(
    eq(tasks.assignedTo, user.id),
    and(isNull(tasks.assignedTo), eq(tasks.createdBy, user.id)),
    user.role === "member" ? sql`exists (
      select 1 from ${projectManagers}
      where ${projectManagers.projectId} = ${tasks.projectId}
        and ${projectManagers.userId} = ${user.id}
    )` : undefined,
  ));
}

/** Use a transaction + lock when subsequent writes affect a task's child records. */
export async function assertTaskAccess(
  taskId: string,
  user: TaskActor,
  mode: "read" | "edit" = "read",
  client: Pick<typeof db, "select"> = db,
  lock?: "share" | "update",
) {
  const query = client.select({
    projectId: tasks.projectId,
    assignedTo: tasks.assignedTo,
    createdBy: tasks.createdBy,
  }).from(tasks).where(eq(tasks.id, taskId)).limit(1);
  const [task] = await (lock ? query.for(lock) : query);
  if (!task || !(mode === "edit" ? await canEditTask(user, task) : canReadTask(user, task))) {
    throw new Error("Task not found or access denied.");
  }
  return task;
}

/** Keep visibility/ownership stable until the related write has committed. */
export async function withTaskAccess<T>(
  taskId: string,
  user: TaskActor,
  mode: "read" | "edit",
  write: (tx: TaskTransaction) => Promise<T>,
) {
  return db.transaction(async (tx) => {
    await assertTaskAccess(taskId, user, mode, tx, mode === "edit" ? "update" : "share");
    return write(tx);
  });
}
