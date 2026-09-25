"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNotNull, or } from "drizzle-orm";
import { z } from "zod";

import { requireRole, requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import {
  budgetApprovalAssignments,
  mouPayments,
  taskDependencies,
  taskDriveFiles,
  tasks,
} from "@/lib/db/schema";
import { advanceChapterAfterDone } from "@/lib/projects/pipeline";
import { clearOverdueNotifications } from "@/lib/notifications";
import { logActivity } from "@/lib/activity/log";
import { formatDate } from "@/lib/format";
import {
  assertPodcastTaskDependenciesComplete,
  notifyReadyEpisodeStages,
} from "@/lib/episodes/workflow-service";
import {
  insertTaskRow,
  notifyAssignment,
  revalidateForTask,
} from "./create";
import {
  isAutoStartEnabled,
  startTimerFor,
  stopTimerFor,
} from "./time-service";
import {
  clearTaskDueDateNotifications,
  reconcileTaskDueDateChange,
} from "./due-date-notifications";

const STATUS_LABEL: Record<string, string> = {
  todo: "To do",
  in_progress: "In progress",
  review: "Review",
  done: "Done",
};

async function assertOrdinaryTask(taskId: string, allowInvoiceDate = false) {
  if (!allowInvoiceDate) {
    const [payment] = await db.select({ id: mouPayments.id }).from(mouPayments)
      .where(and(eq(mouPayments.invoiceTaskId, taskId), isNotNull(mouPayments.sharedMouGroupId))).limit(1);
    if (payment) throw new Error("Invoice tasks are managed from the payment schedule. Sending the invoice completes the task.");
  }
  const [approval] = await db
    .select({ id: budgetApprovalAssignments.id })
    .from(budgetApprovalAssignments)
    .where(eq(budgetApprovalAssignments.taskId, taskId))
    .limit(1);
  if (approval) {
    throw new Error(
      "Budget approval tasks can only be resolved with Approve or Request changes."
    );
  }
}

const createSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  printRunId: z.string().uuid().nullable().optional(),
  phaseId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1, "Title is required").max(300),
  description: z.string().trim().optional(),
  assignedTo: z.string().nullable().optional(),
  dueDate: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  status: z.enum(["todo", "in_progress", "review", "done"]).default("todo"),
  isMilestone: z.boolean().optional(),
  estimateHours: z.coerce.number().min(0).max(9999).optional(),
  driveFolderId: z.string().max(200).nullable().optional(),
  driveFolderName: z.string().max(500).nullable().optional(),
  driveFolderUrl: z.string().url().max(2000).nullable().optional(),
  driveFiles: z
    .array(
      z.object({
        driveFileId: z.string().min(1).max(200),
        name: z.string().min(1).max(500),
        mimeType: z.string().max(200).nullable(),
        iconUrl: z.string().max(1000).nullable(),
        url: z.string().url().max(2000),
      })
    )
    .max(20)
    .default([]),
});

export type TaskFormState = {
  error?: string;
  warning?: string;
  ok?: boolean;
  id?: string;
  title?: string;
  projectId?: string | null;
  assignedTo?: string | null;
  driveFileCount?: number;
};

export async function createTask(
  _prev: TaskFormState,
  formData: FormData
): Promise<TaskFormState> {
  const { user } = await requireUser();
  let driveFiles: unknown = [];
  try {
    driveFiles = JSON.parse(String(formData.get("driveFiles") ?? "[]"));
  } catch {
    return { error: "The selected Drive attachments are invalid." };
  }

  const raw = {
    projectId: (formData.get("projectId") as string) || null,
    printRunId: (formData.get("printRunId") as string) || null,
    phaseId: (formData.get("phaseId") as string) || null,
    title: formData.get("title"),
    description: (formData.get("description") as string) || undefined,
    assignedTo: (formData.get("assignedTo") as string) || null,
    dueDate: (formData.get("dueDate") as string) || undefined,
    priority: (formData.get("priority") as string) || undefined,
    status: (formData.get("status") as string) || undefined,
    isMilestone: formData.get("isMilestone") === "on",
    estimateHours: (formData.get("estimateHours") as string) || undefined,
    driveFolderId: (formData.get("driveFolderId") as string) || undefined,
    driveFolderName: (formData.get("driveFolderName") as string) || undefined,
    driveFolderUrl: (formData.get("driveFolderUrl") as string) || undefined,
    driveFiles,
  };
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;

  const id = await insertTaskRow(
    {
      projectId: d.projectId ?? null,
      printRunId: d.printRunId ?? null,
      phaseId: d.phaseId ?? null,
      title: d.title,
      description: d.description,
      assignedTo: d.assignedTo ?? null,
      dueDate: d.dueDate || null,
      priority: d.priority,
      status: d.status,
      isMilestone: d.isMilestone ?? false,
      estimateHours: d.estimateHours != null ? String(d.estimateHours) : null,
      driveFolderId: d.driveFolderId ?? null,
      driveFolderName: d.driveFolderName ?? null,
      driveFolderUrl: d.driveFolderUrl ?? null,
    },
    {
      actorId: user.id,
      activitySummary: `Created task "${d.title}"`,
      revalidate: false,
    }
  );
  let warning: string | undefined;
  try {
    if (d.driveFiles.length > 0) {
      await db
        .insert(taskDriveFiles)
        .values(
          d.driveFiles.map((file) => ({
            taskId: id,
            driveFileId: file.driveFileId,
            name: file.name,
            mimeType: file.mimeType,
            iconUrl: file.iconUrl,
            url: file.url,
            addedBy: user.id,
          }))
        )
        .onConflictDoNothing();
    }
  } catch {
    warning =
      "Task created, but its Drive attachments could not be linked. Open the task to try again.";
  }
  await revalidateForTask(d.projectId ?? null);
  return {
    ok: true,
    warning,
    id,
    title: d.title,
    projectId: d.projectId ?? null,
    assignedTo: d.assignedTo ?? null,
    driveFileCount: warning ? 0 : d.driveFiles.length,
  };
}

/** Replace a task's "blocked by" predecessors (self-references ignored). */
export async function setTaskDependencies(
  taskId: string,
  dependsOnIds: string[]
) {
  await requireUser();
  const [t] = await db
    .select({ projectId: tasks.projectId })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  const clean = [...new Set(dependsOnIds)].filter((id) => id && id !== taskId);
  await db.transaction(async (tx) => {
    await tx.delete(taskDependencies).where(eq(taskDependencies.taskId, taskId));
    if (clean.length > 0) {
      await tx
        .insert(taskDependencies)
        .values(clean.map((dependsOnTaskId) => ({ taskId, dependsOnTaskId })))
        .onConflictDoNothing();
    }
  });
  await revalidateForTask(t?.projectId ?? null);
}

export async function updateTaskStatus(taskId: string, status: string) {
  const { user } = await requireUser();
  await assertOrdinaryTask(taskId);
  const s = z
    .enum(["todo", "in_progress", "review", "done"])
    .parse(status);
  if (s !== "todo") {
    const [task] = await db
      .select({ podcastStage: tasks.podcastStage })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);
    if (task?.podcastStage) {
      await assertPodcastTaskDependenciesComplete(taskId);
    }
  }
  const [row] = await db
    .update(tasks)
    .set({
      status: s,
      completedAt: s === "done" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId))
    .returning({
      projectId: tasks.projectId,
      title: tasks.title,
      assignedTo: tasks.assignedTo,
    });
  let notificationsChanged = false;
  if (row) {
    await logActivity({
      actorId: user.id,
      projectId: row.projectId,
      entityType: "task",
      entityId: taskId,
      action: "status",
      summary: `Moved "${row.title}" to ${STATUS_LABEL[s] ?? s}`,
    });
    // Auto timer: only when the person doing the work moves their own task.
    if (row.assignedTo === user.id) {
      if (s === "in_progress") {
        if (await isAutoStartEnabled(user.id)) {
          await startTimerFor(user.id, taskId, "auto");
        }
      } else {
        // Left "in progress" — stop this user's running timer if it's on this task.
        await stopTimerFor(user.id, taskId);
      }
    }
    if (s === "done") {
      // Completing a chapter's stage advances it to the next coordinator, and
      // any "task overdue" notification for it is now stale — clear it.
      await advanceChapterAfterDone(taskId, user.id);
      notificationsChanged = (await clearOverdueNotifications(taskId)) > 0;
      await notifyReadyEpisodeStages(taskId, user.id);
    }
  }
  await revalidateForTask(row?.projectId ?? null);
  return { notificationsChanged };
}

export async function assignTask(taskId: string, userId: string | null) {
  const { user } = await requireUser();
  await assertOrdinaryTask(taskId);
  const [before] = await db
    .select({ assignedTo: tasks.assignedTo })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  const [row] = await db
    .update(tasks)
    .set({ assignedTo: userId, updatedAt: new Date() })
    .where(eq(tasks.id, taskId))
    .returning({ projectId: tasks.projectId });
  if (before && before.assignedTo !== userId) {
    await clearTaskDueDateNotifications([taskId]);
  }
  await notifyAssignment(taskId, userId, user.id);
  await revalidateForTask(row?.projectId ?? null);
}

const updateFieldsSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().nullable().optional(),
  dueDate: z.union([z.string().date(), z.literal(""), z.null()]).optional(),
  assignedTo: z.string().nullable().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  isMilestone: z.boolean().optional(),
});

export async function updateTaskFields(
  taskId: string,
  fields: z.infer<typeof updateFieldsSchema>
) {
  const { user } = await requireUser();
  const f = updateFieldsSchema.parse(fields);
  await assertOrdinaryTask(taskId, Object.keys(f).every((key) => key === "dueDate"));
  const [before] = await db
    .select({ dueDate: tasks.dueDate, assignedTo: tasks.assignedTo })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!before) throw new Error("Task not found.");
  const [row] = await db
    .update(tasks)
    .set({
      ...(f.title !== undefined ? { title: f.title } : {}),
      ...(f.description !== undefined ? { description: f.description } : {}),
      ...(f.dueDate !== undefined ? { dueDate: f.dueDate || null } : {}),
      ...(f.dueDate !== undefined ? { dueDateIsManual: true } : {}),
      ...(f.assignedTo !== undefined ? { assignedTo: f.assignedTo } : {}),
      ...(f.priority !== undefined ? { priority: f.priority } : {}),
      ...(f.isMilestone !== undefined ? { isMilestone: f.isMilestone } : {}),
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId))
    .returning({
      projectId: tasks.projectId,
      title: tasks.title,
      dueDate: tasks.dueDate,
      assignedTo: tasks.assignedTo,
    });

  const assignmentChanged =
    f.assignedTo !== undefined && f.assignedTo !== before.assignedTo;
  let notificationsChanged = false;
  if (row && f.dueDate !== undefined) {
    const reconciliation = await reconcileTaskDueDateChange({
      taskId,
      previousDueDate: before.dueDate,
      actorId: user.id,
      notifyAssignee: !assignmentChanged,
    });
    notificationsChanged = reconciliation.notificationsChanged;
    if (reconciliation.changed) {
      await logActivity({
        actorId: user.id,
        projectId: row.projectId,
        entityType: "task",
        entityId: taskId,
        action: "due_date",
        summary: row.dueDate
          ? `Rescheduled "${row.title}" to ${formatDate(row.dueDate)}`
          : `Removed the due date from "${row.title}"`,
      });
    }
  }
  if (row && assignmentChanged) {
    if (f.dueDate === undefined || f.dueDate === before.dueDate) {
      notificationsChanged =
        (await clearTaskDueDateNotifications([taskId])) > 0 ||
        notificationsChanged;
    }
    await notifyAssignment(taskId, row.assignedTo, user.id);
  }
  await revalidateForTask(row?.projectId ?? null);
  return {
    notificationsChanged,
    task: row
      ? { title: row.title, dueDate: row.dueDate, projectId: row.projectId }
      : null,
  };
}

const moveProjectSchema = z.object({
  projectId: z.string().uuid().nullable(),
});

export async function moveTaskToProject(
  taskId: string,
  input: z.infer<typeof moveProjectSchema>
) {
  const { user } = await requireUser();
  await assertOrdinaryTask(taskId);
  const data = moveProjectSchema.parse(input);
  const [before] = await db
    .select({
      projectId: tasks.projectId,
      printPaymentId: tasks.printPaymentId,
      title: tasks.title,
    })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!before) return { error: "Task not found." };
  if ((before.projectId ?? null) === data.projectId) return {};
  if (before.printPaymentId) {
    return { error: "Printer payment tasks stay with their payment project." };
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(taskDependencies)
      .where(
        or(
          eq(taskDependencies.taskId, taskId),
          eq(taskDependencies.dependsOnTaskId, taskId)
        )
      );
    await tx
      .update(tasks)
      .set({
        projectId: data.projectId,
        printRunId: null,
        phaseId: null,
        unitId: null,
        podcastStage: null,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));
  });

  await logActivity({
    actorId: user.id,
    projectId: data.projectId,
    entityType: "task",
    entityId: taskId,
    action: "move",
    summary: data.projectId
      ? `Moved task "${before.title}" to this project`
      : `Moved task "${before.title}" out of its project`,
  });
  await revalidateForTask(before.projectId ?? null);
  if (data.projectId !== before.projectId) await revalidateForTask(data.projectId);
  return {};
}

export async function deleteTask(taskId: string) {
  await requireUser();
  await assertOrdinaryTask(taskId);
  const [row] = await db
    .delete(tasks)
    .where(eq(tasks.id, taskId))
    .returning({ projectId: tasks.projectId });
  await clearTaskDueDateNotifications([taskId]);
  await revalidateForTask(row?.projectId ?? null);
}

/** Set a task's importance rank (PM drag-to-prioritize a person's queue). */
export async function setTaskRank(taskId: string, rank: number) {
  await requireUser();
  const [row] = await db
    .update(tasks)
    .set({ rank, updatedAt: new Date() })
    .where(eq(tasks.id, taskId))
    .returning({ projectId: tasks.projectId });
  await revalidateForTask(row?.projectId ?? null);
}

/**
 * Reorder a person's queue: assign rank = position for each id in order.
 * This is the order they then see in their My-Tasks "Do in this order" list.
 */
export async function reorderUserTasks(orderedTaskIds: string[]) {
  await requireRole("manager");
  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedTaskIds.length; i++) {
      await tx
        .update(tasks)
        .set({ rank: i, updatedAt: new Date() })
        .where(eq(tasks.id, orderedTaskIds[i]));
    }
  });
  revalidatePath("/workload");
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}
