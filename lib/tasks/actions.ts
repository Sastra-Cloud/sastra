"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNotNull, isNull, ne, or } from "drizzle-orm";
import { z } from "zod";

import { requireRole, requireUser } from "@/lib/auth/guards";
import { requireProjectCapability, requireProjectRecord, requireTaskEdit } from "@/lib/auth/project-access";
import { db, type Db } from "@/lib/db";
import {
  budgetApprovalAssignments,
  mouPayments,
  royaltyPayments,
  licenseFeePayments,
  phases,
  printRuns,
  taskDependencies,
  taskDriveFiles,
  tasks,
  user as users,
} from "@/lib/db/schema";
import { assertTaskAccess, taskEditPredicate } from "./access";
import { assertCompleteTaskQueue, assertQueueRevision } from "./queue";
import { lockTaskQueues, nextTaskRank, touchTaskQueue } from "./queue-service";
import { advanceChapterAfterDone, type TaskHandoff } from "@/lib/projects/pipeline";
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

/** A concurrent move/reassignment must not carry permission into another project. */
async function lockEditableTask(
  tx: Pick<Db, "select">,
  taskId: string,
  expected: { projectId: string | null; assignedTo: string | null; createdBy: string | null }
) {
  const [current] = await tx.select({ projectId: tasks.projectId, assignedTo: tasks.assignedTo, createdBy: tasks.createdBy })
    .from(tasks).where(eq(tasks.id, taskId)).for("update");
  if (!current || current.projectId !== expected.projectId || current.assignedTo !== expected.assignedTo || current.createdBy !== expected.createdBy) {
    throw new Error("This task changed. Refresh and try again.");
  }
}

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

async function assertSourceControlledStatusAction(taskId: string) {
  const [task] = await db.select({ printPaymentId: tasks.printPaymentId, lectioManaged: tasks.lectioManaged })
    .from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (task?.lectioManaged) throw new Error("Translation status and removal are managed in Lectio. Open the connected project to change them.");
  if (task?.printPaymentId) {
    throw new Error("Printer payment tasks follow the payment on the Print tab.");
  }
  const [royalty, license] = await Promise.all([
    db.select({ id: royaltyPayments.id }).from(royaltyPayments)
      .where(eq(royaltyPayments.taskId, taskId)).limit(1),
    db.select({ id: licenseFeePayments.id }).from(licenseFeePayments)
      .where(eq(licenseFeePayments.taskId, taskId)).limit(1),
  ]);
  if (royalty[0] || license[0]) {
    throw new Error("Payment tasks are completed by marking the linked payment paid.");
  }
  const [invoice] = await db.select({ id: mouPayments.id }).from(mouPayments)
    .where(eq(mouPayments.invoiceTaskId, taskId)).limit(1);
  if (invoice) throw new Error("Invoice tasks are completed by sending the linked invoice.");
}

async function linkedOutgoingPayment(taskId: string) {
  const [royalty, license] = await Promise.all([
    db.select({ id: royaltyPayments.id }).from(royaltyPayments)
      .where(eq(royaltyPayments.taskId, taskId)).limit(1),
    db.select({ id: licenseFeePayments.id }).from(licenseFeePayments)
      .where(eq(licenseFeePayments.taskId, taskId)).limit(1),
  ]);
  return { royaltyId: royalty[0]?.id, licenseId: license[0]?.id };
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
  isNextUp: z.boolean().default(false),
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
    isNextUp: formData.get("isNextUp") === "true",
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
  if (d.isNextUp || (d.assignedTo && d.assignedTo !== user.id)) await requireProjectCapability(d.projectId, "tasks.manage");
  if (d.isNextUp && !d.assignedTo) return { error: "Choose an assignee for Next up." };
  if (d.isNextUp && d.status === "done") return { error: "Next up is for unfinished work." };
  if (d.assignedTo) {
    const [assignee] = await db.select({ active: users.isActive, bot: users.isBot }).from(users).where(eq(users.id, d.assignedTo));
    if (!assignee?.active || assignee.bot) return { error: "Choose an active teammate." };
  }

  for (const [table, recordId] of [[phases, d.phaseId], [printRuns, d.printRunId]] as const) {
    if (!recordId) continue;
    const [parent] = await db.select({ projectId: table.projectId }).from(table).where(eq(table.id, recordId)).limit(1);
    if (!parent || parent.projectId !== d.projectId) return { error: "Choose a stage or print run from this project." };
  }

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
      isNextUp: d.isNextUp,
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
  const { user, task: authorizedTask } = await requireTaskEdit(taskId);
  await assertOrdinaryTask(taskId);
  const clean = [...new Set(dependsOnIds)].filter((id) => id && id !== taskId);
  const t = await db.transaction(async (tx) => {
    await lockEditableTask(tx, taskId, authorizedTask);
    const task = await assertTaskAccess(taskId, user, "edit", tx);
    // Dependency titles are shown with this task; do not link inaccessible work.
    for (const predecessorId of clean) {
      await assertTaskAccess(predecessorId, user, "read", tx, "share");
    }
    await tx.delete(taskDependencies).where(eq(taskDependencies.taskId, taskId));
    if (clean.length > 0) {
      await tx
        .insert(taskDependencies)
        .values(clean.map((dependsOnTaskId) => ({ taskId, dependsOnTaskId })))
        .onConflictDoNothing();
    }
    return task;
  });
  await revalidateForTask(t?.projectId ?? null);
}

export async function updateTaskStatus(taskId: string, status: string) {
  const { user, task: authorizedTask } = await requireTaskEdit(taskId);
  await assertOrdinaryTask(taskId);
  await assertSourceControlledStatusAction(taskId);
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
  const row = await db.transaction(async (tx) => {
    await lockEditableTask(tx, taskId, authorizedTask);
    const [updated] = await tx
    .update(tasks)
    .set({
      status: s,
      ...(s === "done" ? { isNextUp: false } : {}),
      completedAt: s === "done" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(taskEditPredicate(taskId, user))
    .returning({
      projectId: tasks.projectId,
      title: tasks.title,
      assignedTo: tasks.assignedTo,
    });
    return updated;
  });
  if (!row) throw new Error("Task not found or access denied.");
  let notificationsChanged = false;
  let handoff: TaskHandoff | null = null;
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
      handoff = await advanceChapterAfterDone(taskId, user.id);
      notificationsChanged = (await clearOverdueNotifications(taskId)) > 0;
      await notifyReadyEpisodeStages(taskId, user.id);
    }
  }
  await revalidateForTask(row?.projectId ?? null);
  return { notificationsChanged, handoff };
}

export async function assignTask(taskId: string, userId: string | null) {
  const { user, projectId } = await requireProjectRecord("task", taskId, "tasks.manage");
  const [source] = await db.select({ managed: tasks.lectioManaged }).from(tasks).where(eq(tasks.id, taskId));
  if (source?.managed) throw new Error("Assign translation work in Lectio so its workflow permissions stay in sync.");
  await assertOrdinaryTask(taskId);
  const payment = await linkedOutgoingPayment(taskId);
  if (payment.royaltyId || payment.licenseId) await requireRole("manager");
  const [before] = await db
    .select({ assignedTo: tasks.assignedTo })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  const row = await db.transaction(async (tx) => {
    await lockTaskQueues(tx, [before?.assignedTo ?? null, userId]);
    const [current] = await tx.select({ assignedTo: tasks.assignedTo, projectId: tasks.projectId }).from(tasks).where(eq(tasks.id, taskId)).for("update");
    if (!current || current.assignedTo !== before?.assignedTo || current.projectId !== projectId) throw new Error("This assignment changed. Refresh and try again.");
    if (userId) {
      const [assignee] = await tx.select({ active: users.isActive, bot: users.isBot }).from(users).where(eq(users.id, userId));
      if (!assignee?.active || assignee.bot) throw new Error("Choose an active teammate.");
    }
    const rank = await nextTaskRank(tx, userId);
    const [updated] = await tx.update(tasks)
      .set({ assignedTo: userId, ...(before?.assignedTo !== userId ? { rank, isNextUp: false } : {}), updatedAt: new Date() })
      .where(eq(tasks.id, taskId))
      .returning({ projectId: tasks.projectId });
    if (payment.royaltyId) await tx.update(royaltyPayments)
      .set({ assigneeId: userId }).where(eq(royaltyPayments.id, payment.royaltyId));
    if (payment.licenseId) await tx.update(licenseFeePayments)
      .set({ assigneeId: userId }).where(eq(licenseFeePayments.id, payment.licenseId));
    const revisions: Record<string, number> = {};
    if (before?.assignedTo !== userId) {
      const source = await touchTaskQueue(tx, before?.assignedTo ?? null, user.id);
      const target = await touchTaskQueue(tx, userId, user.id);
      if (source) revisions[source.userId] = source.revision;
      if (target) revisions[target.userId] = target.revision;
    }
    return { ...updated, revisions };
  });
  if (before && before.assignedTo !== userId) {
    await clearTaskDueDateNotifications([taskId]);
  }
  await notifyAssignment(taskId, userId, user.id);
  await revalidateForTask(row?.projectId ?? null);
  return row.revisions;
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
  const { user, task: authorizedTask } = await requireTaskEdit(taskId);
  const f = updateFieldsSchema.parse(fields);
  await assertOrdinaryTask(taskId, Object.keys(f).every((key) => key === "dueDate"));
  const payment = f.assignedTo !== undefined ? await linkedOutgoingPayment(taskId) : null;
  if (payment?.royaltyId || payment?.licenseId) await requireRole("manager");
  const [before] = await db
    .select({ dueDate: tasks.dueDate, assignedTo: tasks.assignedTo, projectId: tasks.projectId, lectioManaged: tasks.lectioManaged })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!before) throw new Error("Task not found.");
  if (f.assignedTo !== undefined && f.assignedTo !== before.assignedTo && before.lectioManaged) throw new Error("Assign translation work in Lectio so its workflow permissions stay in sync.");
  if (f.assignedTo !== undefined && f.assignedTo !== before.assignedTo) {
    await requireProjectCapability(before.projectId, "tasks.manage");
  }
  const row = await db.transaction(async (tx) => {
    await lockEditableTask(tx, taskId, authorizedTask);
    const assignmentChanged = f.assignedTo !== undefined && f.assignedTo !== before.assignedTo;
    if (assignmentChanged) {
      await lockTaskQueues(tx, [before.assignedTo, f.assignedTo ?? null]);
      const [current] = await tx.select({ assignedTo: tasks.assignedTo }).from(tasks).where(eq(tasks.id, taskId)).for("update");
      if (!current || current.assignedTo !== before.assignedTo) throw new Error("This assignment changed. Refresh and try again.");
      if (f.assignedTo) {
        const [assignee] = await tx.select({ active: users.isActive, bot: users.isBot }).from(users).where(eq(users.id, f.assignedTo));
        if (!assignee?.active || assignee.bot) throw new Error("Choose an active teammate.");
      }
    }
    const [updated] = await tx.update(tasks)
    .set({
      ...(f.title !== undefined ? { title: f.title } : {}),
      ...(f.description !== undefined ? { description: f.description } : {}),
      ...(f.dueDate !== undefined ? { dueDate: f.dueDate || null } : {}),
      ...(f.dueDate !== undefined ? { dueDateIsManual: true } : {}),
      ...(f.assignedTo !== undefined ? { assignedTo: f.assignedTo } : {}),
      ...(assignmentChanged ? { rank: await nextTaskRank(tx, f.assignedTo ?? null), isNextUp: false } : {}),
      ...(f.priority !== undefined ? { priority: f.priority } : {}),
      ...(f.isMilestone !== undefined ? { isMilestone: f.isMilestone } : {}),
      updatedAt: new Date(),
    })
    .where(and(
      taskEditPredicate(taskId, user),
      // Even an unchanged submitted assignee must not undo a newer assignment.
      before.assignedTo === null ? isNull(tasks.assignedTo) : eq(tasks.assignedTo, before.assignedTo),
    ))
    .returning({
      projectId: tasks.projectId,
      title: tasks.title,
      dueDate: tasks.dueDate,
      assignedTo: tasks.assignedTo,
    });
    if (!updated) throw new Error("This assignment changed or access was denied. Refresh and try again.");
    if (payment?.royaltyId) await tx.update(royaltyPayments)
      .set({ assigneeId: f.assignedTo }).where(eq(royaltyPayments.id, payment.royaltyId));
    if (payment?.licenseId) await tx.update(licenseFeePayments)
      .set({ assigneeId: f.assignedTo }).where(eq(licenseFeePayments.id, payment.licenseId));
    if (assignmentChanged) {
      await touchTaskQueue(tx, before.assignedTo, user.id);
      await touchTaskQueue(tx, f.assignedTo ?? null, user.id);
    }
    return updated;
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
  const { user, task: sourceTask } = await requireTaskEdit(taskId);
  await assertOrdinaryTask(taskId);
  await assertSourceControlledStatusAction(taskId);
  const data = moveProjectSchema.parse(input);
  const ownWork = sourceTask.assignedTo === user.id || (!sourceTask.assignedTo && sourceTask.createdBy === user.id);
  if (!ownWork) await requireProjectCapability(data.projectId, "tasks.manage");
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
    await lockEditableTask(tx, taskId, sourceTask);
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
        isNextUp: false,
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
  const { user, task: authorizedTask } = await requireTaskEdit(taskId);
  await assertOrdinaryTask(taskId);
  await assertSourceControlledStatusAction(taskId);
  const row = await db.transaction(async (tx) => {
    await lockEditableTask(tx, taskId, authorizedTask);
    const [deleted] = await tx
    .delete(tasks)
    .where(taskEditPredicate(taskId, user))
    .returning({ projectId: tasks.projectId });
    return deleted;
  });
  if (!row) throw new Error("Task not found or access denied.");
  await clearTaskDueDateNotifications([taskId]);
  await revalidateForTask(row?.projectId ?? null);
}

/** Set a task's importance rank (PM drag-to-prioritize a person's queue). */
export async function reorderUserTasks(assigneeId: string, orderedTaskIds: string[], expectedRevision: number) {
  const { user } = await requireRole("manager");
  z.object({ assigneeId: z.string().min(1), ids: z.array(z.string().uuid()).max(10000), revision: z.number().int().nonnegative() })
    .parse({ assigneeId, ids: orderedTaskIds, revision: expectedRevision });
  const queue = await db.transaction(async (tx) => {
    const queues = await lockTaskQueues(tx, [assigneeId]);
    assertQueueRevision(queues.get(assigneeId)!.revision, expectedRevision);
    const current = await tx.select({ id: tasks.id }).from(tasks)
      .where(and(eq(tasks.assignedTo, assigneeId), ne(tasks.status, "done"))).for("update");
    assertCompleteTaskQueue(current.map(task => task.id), orderedTaskIds);
    for (let i = 0; i < orderedTaskIds.length; i++) {
      await tx
        .update(tasks)
        .set({ rank: i })
        .where(eq(tasks.id, orderedTaskIds[i]));
    }
    return touchTaskQueue(tx, assigneeId, user.id);
  });
  revalidatePath("/workload");
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  return queue;
}

/** Selection changes only queue intent, never status, deadlines, or task activity. */
export async function setTaskNextUp(taskId: string, isNextUp: boolean, expectedRevision?: number) {
  const { user, projectId } = await requireProjectRecord("task", taskId, "tasks.manage");
  z.object({ taskId: z.string().uuid(), isNextUp: z.boolean(), expectedRevision: z.number().int().nonnegative().optional() })
    .parse({ taskId, isNextUp, expectedRevision });
  const result = await db.transaction(async (tx) => {
    const [before] = await tx.select({ assignedTo: tasks.assignedTo }).from(tasks).where(eq(tasks.id, taskId));
    if (!before?.assignedTo) throw new Error("Assign this task before adding it to Next up.");
    const queues = await lockTaskQueues(tx, [before.assignedTo]);
    assertQueueRevision(queues.get(before.assignedTo)!.revision, expectedRevision);
    const [task] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).for("update");
    if (!task || task.projectId !== projectId || task.assignedTo !== before.assignedTo || task.status === "done") throw new Error("This assignment changed. Refresh and try again.");
    const rank = isNextUp !== task.isNextUp ? await nextTaskRank(tx, task.assignedTo) : task.rank;
    await tx.update(tasks).set({ isNextUp, rank }).where(eq(tasks.id, taskId));
    const queue = await touchTaskQueue(tx, task.assignedTo, user.id);
    return { isNextUp, rank, queue };
  });
  revalidatePath("/workload");
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  return result;
}
