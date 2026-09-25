import "server-only";

import { addDays } from "date-fns";
import { and, asc, eq, gt } from "drizzle-orm";

import { db } from "@/lib/db";
import { phases, projectMembers, projects, tasks } from "@/lib/db/schema";
import { notify } from "@/lib/notifications";
import { clearTaskDueDateNotifications } from "@/lib/tasks/due-date-notifications";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * When a chapter's stage task is completed, advance that chapter to the next
 * pipeline stage: set the next stage task's due date (completion + that stage's
 * duration), ensure it's assigned to the stage coordinator, and notify them.
 * Best-effort — never blocks the status change.
 */
export async function advanceChapterAfterDone(
  taskId: string,
  actorId: string
): Promise<void> {
  try {
    const [t] = await db
      .select({
        projectId: tasks.projectId,
        unitId: tasks.unitId,
        phaseId: tasks.phaseId,
        completedAt: tasks.completedAt,
      })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);
    // Only chapter (unit) tasks within a phase participate in the pipeline.
    if (!t?.projectId || !t.unitId || !t.phaseId) return;

    const [cur] = await db
      .select({ orderIndex: phases.orderIndex })
      .from(phases)
      .where(eq(phases.id, t.phaseId))
      .limit(1);
    if (!cur) return;

    // Stages after the current one, in order.
    const later = await db
      .select({
        id: phases.id,
        durationDays: phases.durationDays,
        projectRoleId: phases.projectRoleId,
      })
      .from(phases)
      .where(
        and(eq(phases.projectId, t.projectId), gt(phases.orderIndex, cur.orderIndex))
      )
      .orderBy(asc(phases.orderIndex));

    const completed = t.completedAt ? new Date(t.completedAt) : new Date();

    for (const np of later) {
      // The next stage that actually has a task for THIS chapter.
      const [nextTask] = await db
        .select({ id: tasks.id, assignedTo: tasks.assignedTo, title: tasks.title })
        .from(tasks)
        .where(
          and(
            eq(tasks.projectId, t.projectId),
            eq(tasks.unitId, t.unitId),
            eq(tasks.phaseId, np.id)
          )
        )
        .limit(1);
      if (!nextTask) continue;

      // Resolve the stage coordinator if the task isn't already assigned.
      let assignee = nextTask.assignedTo;
      if (!assignee && np.projectRoleId) {
        const [m] = await db
          .select({ userId: projectMembers.userId })
          .from(projectMembers)
          .where(
            and(
              eq(projectMembers.projectId, t.projectId),
              eq(projectMembers.projectRoleId, np.projectRoleId)
            )
          )
          .limit(1);
        assignee = m?.userId ?? null;
      }

      await db
        .update(tasks)
        .set({
          dueDate: ymd(addDays(completed, np.durationDays ?? 0)),
          assignedTo: assignee,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, nextTask.id));
      await clearTaskDueDateNotifications([nextTask.id]);

      if (assignee && assignee !== actorId) {
        const [p] = await db
          .select({ slug: projects.slug, title: projects.title })
          .from(projects)
          .where(eq(projects.id, t.projectId))
          .limit(1);
        await notify({
          userId: assignee,
          type: "task_ready",
          title: `Ready for you: ${nextTask.title}`,
          project: p?.title,
          link: p ? `/projects/${p.slug}/tasks` : "/dashboard",
          data: { taskId: nextTask.id },
        });
      }
      return; // advance only to the immediate next stage
    }
  } catch {
    // best-effort; pipeline advancement must never break a status update
  }
}
