import "server-only";

import { and, eq, isNull, lt, ne, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { notifications, projects, tasks, mouPayments } from "@/lib/db/schema";
import { notify } from ".";
import { getWorkspaceSettings } from "@/lib/workspace/queries";
import { agendaToday } from "@/lib/agenda/queries";
import { overdueTaskBody } from "@/lib/tasks/due-date-copy";

/**
 * Notify assignees of overdue, not-done tasks. Deduped: skips a task if the
 * assignee already has an unread task_overdue notification for it.
 */
export async function notifyOverdueAssignees(): Promise<number> {
  const workspace = await getWorkspaceSettings();
  const today = agendaToday(new Date(), workspace.timezone);

  const overdue = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      dueDate: tasks.dueDate,
      assignedTo: tasks.assignedTo,
      slug: projects.slug,
      projectTitle: projects.title,
    })
    .from(tasks)
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .where(
      and(
        sql`${tasks.assignedTo} is not null`,
        ne(tasks.status, "done"),
        sql`not exists (select 1 from ${mouPayments} where ${mouPayments.invoiceTaskId} = ${tasks.id}
          and ${mouPayments.sharedMouGroupId} is not null
          and ${mouPayments.readinessStatus} = 'locked'
          and coalesce(${mouPayments.readinessReason}, '') not like 'Delivery evidence%')`,
        lt(tasks.dueDate, today)
      )
    );

  let notified = 0;
  for (const t of overdue) {
    if (!t.assignedTo) continue;
    const [existing] = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, t.assignedTo),
          eq(notifications.type, "task_overdue"),
          isNull(notifications.readAt),
          sql`(${notifications.data} ->> 'taskId') = ${t.id}`
        )
      )
      .limit(1);
    if (existing) continue;

    await notify({
      userId: t.assignedTo,
      type: "task_overdue",
      title: `Overdue: ${t.title}`,
      body: overdueTaskBody(t.title, t.dueDate!),
      project: t.projectTitle ?? undefined,
      link: t.slug ? `/projects/${t.slug}/tasks?task=${t.id}` : `/tasks?task=${t.id}`,
      data: { taskId: t.id, dueDate: t.dueDate },
    });
    notified += 1;
  }
  return notified;
}
