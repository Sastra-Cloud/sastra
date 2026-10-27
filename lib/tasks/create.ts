import "server-only";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { projects, tasks } from "@/lib/db/schema";
import { recomputeProjectBlockers } from "@/lib/blockers/engine";
import { notify } from "@/lib/notifications";
import { logActivity } from "@/lib/activity/log";
import { formatDate } from "@/lib/format";
import type { PodcastStage } from "@/lib/episodes/workflow";
import { type TaskTransaction, lockTaskQueues, nextTaskRank, touchTaskQueue } from "./queue-service";
import { taskAssignmentFields, type TaskAssignmentSource } from "./assignment";

/** Notify a newly-assigned user (skips self-assignment). */
export async function notifyAssignment(
  taskId: string,
  assigneeId: string | null,
  actorId: string
) {
  if (!assigneeId || assigneeId === actorId) return;
  const [t] = await db
    .select({
      title: tasks.title,
      slug: projects.slug,
      projectTitle: projects.title,
      dueDate: tasks.dueDate,
    })
    .from(tasks)
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!t) return;
  await notify({
    userId: assigneeId,
    type: "task_assigned",
    title: `Task assigned to you: ${t.title}`,
    body: t.dueDate ? `Due ${formatDate(t.dueDate)}` : undefined,
    project: t.projectTitle ?? undefined,
    link: t.slug ? `/projects/${t.slug}/tasks?task=${taskId}` : `/tasks?task=${taskId}`,
    data: { taskId, dueDate: t.dueDate },
  });
}

export async function revalidateForTask(projectId: string | null) {
  revalidatePath("/dashboard");
  revalidatePath("/tasks");
  revalidatePath("/workload");
  if (projectId) {
    // Task changes can resolve/create overdue blockers + shift project health.
    await recomputeProjectBlockers(projectId);
    const [p] = await db
      .select({ slug: projects.slug })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (p) {
      revalidatePath(`/projects/${p.slug}/tasks`);
      revalidatePath(`/projects/${p.slug}/episodes`);
      revalidatePath(`/projects/${p.slug}`);
      revalidatePath("/projects");
    }
  }
}

export type InsertTaskValues = {
  lectioManaged?: boolean;
  projectId?: string | null;
  printRunId?: string | null;
  printPaymentId?: string | null;
  phaseId?: string | null;
  unitId?: string | null;
  podcastStage?: PodcastStage | null;
  title: string;
  description?: string | null;
  status?: "todo" | "in_progress" | "review" | "done";
  priority?: "low" | "medium" | "high" | "urgent";
  assignedTo?: string | null;
  dueDate?: string | null;
  dueDateIsManual?: boolean;
  isMilestone?: boolean;
  isNextUp?: boolean;
  estimateHours?: string | null;
  driveFolderId?: string | null;
  driveFolderName?: string | null;
  driveFolderUrl?: string | null;
  sourceRecurringTaskId?: string | null;
};

/**
 * Single place that creates a task row and runs the standard side effects
 * (assignee notification, optional activity log, optional revalidation). Shared
 * by `createTask`, the recurring-task generator, and the royalty generator.
 * Kept out of the `"use server"` action file so it is NOT exposed as a callable
 * server action (it performs no auth itself). Generators pass `revalidate:false`
 * (the daily cron recomputes blockers globally).
 */
export async function insertTaskRow(
  values: InsertTaskValues,
  opts: {
    actorId: string | null;
    assignmentSource?: TaskAssignmentSource;
    activitySummary?: string;
    revalidate?: boolean;
    notifyAssignment?: boolean;
  }
): Promise<string> {
  const created = await db.transaction(async (tx) => {
    return insertTaskInTransaction(tx, values, opts.actorId, opts.assignmentSource);
  });

  const id = created.id;
  if (opts.notifyAssignment !== false) {
    await notifyAssignment(id, values.assignedTo ?? null, opts.actorId ?? "");
  }
  if (opts.activitySummary && opts.actorId) {
    await logActivity({
      actorId: opts.actorId,
      projectId: values.projectId ?? null,
      entityType: "task",
      entityId: id,
      action: "create",
      summary: opts.activitySummary,
    });
  }
  if (opts.revalidate !== false) await revalidateForTask(values.projectId ?? null);
  return id;
}

/** Transactional core; callers persist their own durable effects in the same transaction. */
export async function insertTaskInTransaction(
  tx: TaskTransaction, values: InsertTaskValues, actorId: string | null,
  assignmentSource: TaskAssignmentSource = "system",
) {
  const status = values.status ?? "todo";
    await lockTaskQueues(tx, [values.assignedTo ?? null]);
    const rank = await nextTaskRank(tx, values.assignedTo ?? null);
    const [row] = await tx
      .insert(tasks)
      .values({
        lectioManaged: values.lectioManaged ?? false,
        projectId: values.projectId ?? null,
        printRunId: values.printRunId ?? null,
        printPaymentId: values.printPaymentId ?? null,
        phaseId: values.phaseId ?? null,
        unitId: values.unitId ?? null,
        podcastStage: values.podcastStage ?? null,
        title: values.title,
        description: values.description ?? undefined,
        status,
        rank,
        isNextUp: Boolean(values.isNextUp && values.assignedTo && status !== "done"),
        priority: values.priority ?? "medium",
        assignedTo: values.assignedTo ?? null,
        ...taskAssignmentFields(actorId, values.assignedTo ?? null, assignmentSource),
        dueDate: values.dueDate || null,
        dueDateIsManual: values.dueDateIsManual ?? false,
        isMilestone: values.isMilestone ?? false,
        estimateHours: values.estimateHours ?? null,
        driveFolderId: values.driveFolderId ?? null,
        driveFolderName: values.driveFolderName ?? null,
        driveFolderUrl: values.driveFolderUrl ?? null,
        completedAt: status === "done" ? new Date() : null,
        createdBy: actorId,
        sourceRecurringTaskId: values.sourceRecurringTaskId ?? null,
      })
      .returning({ id: tasks.id });
    await touchTaskQueue(tx, values.assignedTo ?? null, actorId);
    return row;
}
