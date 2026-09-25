"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { z } from "zod";

import { requireRole, requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import {
  budgetApprovalAssignments,
  budgetApprovalRequests,
  projects,
  tasks,
} from "@/lib/db/schema";
import {
  currentBudgetApprovalAuthorization,
  getBudgetApprovalSnapshot,
  insertApprovalTask,
  syncBudgetApprovalState,
} from "@/lib/budget/approval-service";
import {
  getBudgetApprovalState,
  listEligibleBudgetApprovers,
} from "@/lib/budget/approval-queries";
import { clearOverdueNotifications, notify } from "@/lib/notifications";
import { logActivity } from "@/lib/activity/log";
import { approvalStatusForDecisions } from "@/lib/budget/approval-rules";
import { revalidateForTask } from "@/lib/tasks/create";
import { reconcileTaskDueDateChange } from "@/lib/tasks/due-date-notifications";
import { formatDate } from "@/lib/format";

export type BudgetApprovalActionResult = { ok?: true; error?: string };

async function projectMeta(projectId: string) {
  const [project] = await db
    .select({ title: projects.title, slug: projects.slug })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return project ?? null;
}

function revalidateApprovalPaths(slug: string) {
  revalidatePath(`/projects/${slug}/budget`);
  revalidatePath(`/projects/${slug}/tasks`);
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  revalidatePath("/workload");
}

const createSchema = z.object({
  projectId: z.string().uuid(),
  printRunId: z.string().uuid().nullable().optional(),
  approverIds: z.array(z.string().min(1)).min(1),
  dueDate: z.string().date(),
});

export async function createBudgetApprovalRequest(input: {
  projectId: string;
  printRunId?: string | null;
  approverIds: string[];
  dueDate: string;
}): Promise<BudgetApprovalActionResult> {
  const { user: requester } = await requireRole("manager");
  const data = createSchema.parse(input);
  const approverIds = [...new Set(data.approverIds)];
  if (data.dueDate < new Date().toISOString().slice(0, 10)) {
    return { error: "Choose today or a future due date." };
  }
  if (approverIds.includes(requester.id)) {
    return { error: "You cannot approve your own request." };
  }

  await syncBudgetApprovalState(data.projectId, data.printRunId);
  const scopeCondition = data.printRunId
    ? eq(budgetApprovalRequests.printRunId, data.printRunId)
    : isNull(budgetApprovalRequests.printRunId);
  const [project, current, eligible, snapshot] = await Promise.all([
    projectMeta(data.projectId),
    db
      .select({ id: budgetApprovalRequests.id })
      .from(budgetApprovalRequests)
      .where(
        and(
          eq(budgetApprovalRequests.projectId, data.projectId),
          scopeCondition,
          ne(budgetApprovalRequests.status, "superseded")
        )
      )
      .limit(1)
      .then((rows) => rows[0] ?? null),
    listEligibleBudgetApprovers(requester.id),
    getBudgetApprovalSnapshot(data.projectId, data.printRunId),
  ]);
  if (!project) return { error: "Project not found." };
  if (current) {
    return { error: "This project already has a current approval round." };
  }
  const eligibleIds = new Set(eligible.map((candidate) => candidate.id));
  const invalid = approverIds.find((id) => !eligibleIds.has(id));
  if (invalid) {
    return {
      error:
        "Approvers must be active workspace managers or admins.",
    };
  }

  let requestId = "";
  const taskIds: string[] = [];
  await db.transaction(async (tx) => {
    const [request] = await tx
      .insert(budgetApprovalRequests)
      .values({
        projectId: data.projectId,
        printRunId: data.printRunId ?? null,
        requesterId: requester.id,
        dueDate: data.dueDate,
        fingerprint: snapshot.fingerprint,
        currency: snapshot.currency,
        totalAmount: snapshot.totalAmount,
      })
      .returning({ id: budgetApprovalRequests.id });
    requestId = request.id;
    for (const approverId of approverIds) {
      const taskId = await insertApprovalTask(tx, {
        projectId: data.projectId,
        projectTitle: project.title,
        approverId,
        requesterId: requester.id,
        dueDate: data.dueDate,
      });
      taskIds.push(taskId);
      await tx.insert(budgetApprovalAssignments).values({
        requestId: request.id,
        approverId,
        taskId,
      });
    }
  });

  await Promise.all(
    approverIds.map((userId, index) =>
      notify({
        userId,
        type: "budget_approval_assigned",
        title: "Budget approval requested",
        body: `Review by ${formatDate(data.dueDate)}.`,
        project: project.title,
        link: `/projects/${project.slug}/budget${
          data.printRunId ? `?run=${data.printRunId}` : ""
        }#budget-approval`,
        data: {
          projectId: data.projectId,
          approvalRequestId: requestId,
          taskId: taskIds[index],
        },
      })
    )
  );
  await logActivity({
    actorId: requester.id,
    projectId: data.projectId,
    entityType: "budget_approval",
    entityId: requestId,
    action: "request",
    summary: `Requested budget approval from ${approverIds.length} approver${
      approverIds.length === 1 ? "" : "s"
    }`,
  });
  revalidateApprovalPaths(project.slug);
  return { ok: true };
}

const dueDateSchema = z.string().date();

/** Let managers reschedule protected approval tasks without unlocking other fields. */
export async function updateBudgetApprovalTaskDueDate(
  taskId: string,
  dueDate: string
): Promise<BudgetApprovalActionResult> {
  const { user } = await requireRole("manager");
  const parsedDueDate = dueDateSchema.safeParse(dueDate);
  if (!parsedDueDate.success) return { error: "Choose a valid due date." };

  const [assignment] = await db
    .select({
      requestId: budgetApprovalAssignments.requestId,
      requestStatus: budgetApprovalRequests.status,
      projectId: budgetApprovalRequests.projectId,
      printRunId: budgetApprovalRequests.printRunId,
      projectSlug: projects.slug,
    })
    .from(budgetApprovalAssignments)
    .innerJoin(
      budgetApprovalRequests,
      eq(budgetApprovalRequests.id, budgetApprovalAssignments.requestId)
    )
    .innerJoin(projects, eq(projects.id, budgetApprovalRequests.projectId))
    .where(eq(budgetApprovalAssignments.taskId, taskId))
    .limit(1);
  if (!assignment) return { error: "Budget approval task not found." };

  const affectedTasks = assignment.requestStatus === "superseded"
    ? await db
        .select({ taskId: tasks.id, dueDate: tasks.dueDate })
        .from(tasks)
        .where(eq(tasks.id, taskId))
    : await db
        .select({
          taskId: budgetApprovalAssignments.taskId,
          dueDate: tasks.dueDate,
        })
        .from(budgetApprovalAssignments)
        .innerJoin(tasks, eq(tasks.id, budgetApprovalAssignments.taskId))
        .where(eq(budgetApprovalAssignments.requestId, assignment.requestId));

  if (assignment.requestStatus === "superseded") {
    await db
      .update(tasks)
      .set({
        dueDate: parsedDueDate.data,
        dueDateIsManual: true,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));
  } else {
    await db.transaction(async (tx) => {
      const linkedAssignments = await tx
        .select({ taskId: budgetApprovalAssignments.taskId })
        .from(budgetApprovalAssignments)
        .where(eq(budgetApprovalAssignments.requestId, assignment.requestId));
      const taskIds = linkedAssignments.map((item) => item.taskId);

      await tx
        .update(budgetApprovalRequests)
        .set({ dueDate: parsedDueDate.data, updatedAt: new Date() })
        .where(eq(budgetApprovalRequests.id, assignment.requestId));
      if (taskIds.length > 0) {
        await tx
          .update(tasks)
          .set({
            dueDate: parsedDueDate.data,
            dueDateIsManual: true,
            updatedAt: new Date(),
          })
          .where(inArray(tasks.id, taskIds));
      }
    });
  }

  await Promise.all(
    affectedTasks.map((task) =>
      reconcileTaskDueDateChange({
        taskId: task.taskId,
        previousDueDate: task.dueDate,
        actorId: user.id,
      })
    )
  );

  await logActivity({
    actorId: user.id,
    projectId: assignment.projectId,
    entityType: "budget_approval",
    entityId: assignment.requestId,
    action: "reschedule",
    summary: `Changed the budget approval due date to ${parsedDueDate.data}`,
  });
  await revalidateForTask(assignment.projectId);
  revalidateApprovalPaths(assignment.projectSlug);
  return { ok: true };
}

async function loadAssignment(assignmentId: string) {
  const [row] = await db
    .select({
      id: budgetApprovalAssignments.id,
      approverId: budgetApprovalAssignments.approverId,
      taskId: budgetApprovalAssignments.taskId,
      decision: budgetApprovalAssignments.decision,
      requestId: budgetApprovalRequests.id,
      requestStatus: budgetApprovalRequests.status,
      requesterId: budgetApprovalRequests.requesterId,
      projectId: budgetApprovalRequests.projectId,
      printRunId: budgetApprovalRequests.printRunId,
      projectTitle: projects.title,
      projectSlug: projects.slug,
    })
    .from(budgetApprovalAssignments)
    .innerJoin(
      budgetApprovalRequests,
      eq(budgetApprovalRequests.id, budgetApprovalAssignments.requestId)
    )
    .innerJoin(projects, eq(projects.id, budgetApprovalRequests.projectId))
    .where(eq(budgetApprovalAssignments.id, assignmentId))
    .limit(1);
  return row ?? null;
}

async function assertCurrentApprover(assignmentId: string, userId: string) {
  let assignment = await loadAssignment(assignmentId);
  if (!assignment) return { error: "Approval assignment not found." } as const;
  if (assignment.approverId !== userId) {
    return { error: "Only the assigned approver can respond." } as const;
  }
  await syncBudgetApprovalState(assignment.projectId, assignment.printRunId);
  assignment = await loadAssignment(assignmentId);
  if (!assignment || assignment.requestStatus === "superseded") {
    return {
      error: "This approval task is out of date. Open the current approval round.",
    } as const;
  }
  return { assignment } as const;
}

export async function approveBudgetApprovalAssignment(
  assignmentId: string
): Promise<BudgetApprovalActionResult> {
  const { user } = await requireRole("manager");
  const checked = await assertCurrentApprover(assignmentId, user.id);
  if ("error" in checked) return { error: checked.error };
  const { assignment } = checked;
  if (assignment.decision === "approved") return { ok: true };
  if (assignment.requestStatus !== "pending") {
    return { error: "This approval round is not accepting decisions." };
  }

  let unanimouslyApproved = false;
  await db.transaction(async (tx) => {
    await tx
      .update(budgetApprovalAssignments)
      .set({
        decision: "approved",
        changeNote: null,
        decidedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(budgetApprovalAssignments.id, assignment.id));
    await tx
      .update(tasks)
      .set({ status: "done", completedAt: new Date(), updatedAt: new Date() })
      .where(eq(tasks.id, assignment.taskId));
    const decisions = await tx
      .select({ decision: budgetApprovalAssignments.decision })
      .from(budgetApprovalAssignments)
      .where(eq(budgetApprovalAssignments.requestId, assignment.requestId));
    unanimouslyApproved =
      approvalStatusForDecisions(
        decisions.map((decision) => decision.decision)
      ) === "approved";
    if (unanimouslyApproved) {
      await tx
        .update(budgetApprovalRequests)
        .set({ status: "approved", approvedAt: new Date(), updatedAt: new Date() })
        .where(eq(budgetApprovalRequests.id, assignment.requestId));
    }
  });

  await clearOverdueNotifications(assignment.taskId);

  if (unanimouslyApproved && assignment.requesterId !== user.id) {
    await notify({
      userId: assignment.requesterId,
      type: "budget_approval_complete",
      title: "Budget approved",
      body: "The current quotation has unanimous budget approval.",
      project: assignment.projectTitle ?? undefined,
      link: `/projects/${assignment.projectSlug}/budget${
        assignment.printRunId ? `?run=${assignment.printRunId}` : ""
      }#budget-approval`,
      data: { approvalRequestId: assignment.requestId },
    });
  }
  await logActivity({
    actorId: user.id,
    projectId: assignment.projectId,
    entityType: "budget_approval",
    entityId: assignment.requestId,
    action: "approve",
    summary: "Approved the current budget",
  });
  revalidateApprovalPaths(assignment.projectSlug);
  return { ok: true };
}

const changeSchema = z.string().trim().min(1).max(2000);

export async function requestBudgetApprovalChanges(
  assignmentId: string,
  note: string
): Promise<BudgetApprovalActionResult> {
  const { user } = await requireRole("manager");
  const parsed = changeSchema.safeParse(note);
  if (!parsed.success) return { error: "Explain what needs to change." };
  const checked = await assertCurrentApprover(assignmentId, user.id);
  if ("error" in checked) return { error: checked.error };
  const { assignment } = checked;
  if (assignment.decision === "changes_requested") return { ok: true };
  if (assignment.decision !== "pending") {
    return { error: "You already responded to this approval round." };
  }
  if (assignment.requestStatus !== "pending") {
    return { error: "This approval round is not accepting decisions." };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(budgetApprovalAssignments)
      .set({
        decision: "changes_requested",
        changeNote: parsed.data,
        decidedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(budgetApprovalAssignments.id, assignment.id));
    await tx
      .update(tasks)
      .set({ status: "review", completedAt: null, updatedAt: new Date() })
      .where(eq(tasks.id, assignment.taskId));
    await tx
      .update(budgetApprovalRequests)
      .set({ status: "changes_requested", updatedAt: new Date() })
      .where(eq(budgetApprovalRequests.id, assignment.requestId));
  });

  if (assignment.requesterId !== user.id) {
    await notify({
      userId: assignment.requesterId,
      type: "budget_changes_requested",
      title: `${user.name} requested budget changes`,
      body: parsed.data,
      project: assignment.projectTitle ?? undefined,
      link: `/projects/${assignment.projectSlug}/budget${
        assignment.printRunId ? `?run=${assignment.printRunId}` : ""
      }#budget-approval`,
      data: { approvalRequestId: assignment.requestId },
    });
  }
  await logActivity({
    actorId: user.id,
    projectId: assignment.projectId,
    entityType: "budget_approval",
    entityId: assignment.requestId,
    action: "changes_requested",
    summary: "Requested changes to the current budget",
  });
  revalidateApprovalPaths(assignment.projectSlug);
  return { ok: true };
}

/** Explicit server-action seam for clients that need to refresh stale state. */
export async function synchronizeBudgetApproval(
  projectId: string,
  printRunId?: string | null
) {
  await requireUser();
  const parsedProjectId = z.string().uuid().parse(projectId);
  const parsedRunId = printRunId
    ? z.string().uuid().parse(printRunId)
    : null;
  await syncBudgetApprovalState(parsedProjectId, parsedRunId);
  return getBudgetApprovalState(parsedProjectId, parsedRunId);
}

/** Exported for proposal-send enforcement without exposing DB details. */
export async function authorizeCurrentBudgetForProposal(
  projectId: string,
  printRunId?: string | null
) {
  await requireRole("manager");
  return currentBudgetApprovalAuthorization(projectId, printRunId);
}
