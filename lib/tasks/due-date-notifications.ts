import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { projects, tasks } from "@/lib/db/schema";
import {
  clearOverdueNotificationsForTasks,
  notify,
} from "@/lib/notifications";
import { dueDateChangeBody } from "./due-date-copy";

/**
 * A due-date notification describes the deadline that existed when it was
 * created. Once that deadline changes, retire every read and unread overdue
 * alert for the task. The daily overdue job will create a fresh alert later if
 * the replacement date is also in the past.
 */
export async function clearTaskDueDateNotifications(
  taskIds: readonly string[]
): Promise<number> {
  const uniqueIds = [...new Set(taskIds.filter(Boolean))];
  if (uniqueIds.length === 0) return 0;
  return clearOverdueNotificationsForTasks(uniqueIds);
}

/**
 * Reconcile one user-initiated due-date edit. Self-edits stay quiet; when
 * someone else reschedules an assigned task, the assignee gets the new date in
 * app, push, and (when enabled) email.
 */
export async function reconcileTaskDueDateChange(input: {
  taskId: string;
  previousDueDate: string | null;
  actorId: string;
  notifyAssignee?: boolean;
}): Promise<{ changed: boolean; notificationsChanged: boolean }> {
  const [task] = await db
    .select({
      title: tasks.title,
      dueDate: tasks.dueDate,
      assignedTo: tasks.assignedTo,
      projectTitle: projects.title,
      projectSlug: projects.slug,
    })
    .from(tasks)
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .where(eq(tasks.id, input.taskId))
    .limit(1);

  if (!task || task.dueDate === input.previousDueDate) {
    return { changed: false, notificationsChanged: false };
  }

  const cleared = await clearTaskDueDateNotifications([input.taskId]);
  const shouldNotifyAssignee =
    input.notifyAssignee !== false &&
    task.assignedTo != null &&
    task.assignedTo !== input.actorId;

  if (shouldNotifyAssignee && task.assignedTo) {
    await notify({
      userId: task.assignedTo,
      type: "task_due_date_changed",
      title: `Due date changed: ${task.title}`,
      body: dueDateChangeBody(task.title, task.dueDate),
      project: task.projectTitle ?? undefined,
      link: task.projectSlug
        ? `/projects/${task.projectSlug}/tasks?task=${input.taskId}`
        : `/tasks?task=${input.taskId}`,
      data: { taskId: input.taskId, dueDate: task.dueDate },
    });
  }

  return {
    changed: true,
    notificationsChanged: cleared > 0 || shouldNotifyAssignee,
  };
}
