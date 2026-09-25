import "server-only";

import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  budgetApprovalAssignments,
  budgetApprovalRequests,
  projects,
  tasks,
} from "@/lib/db/schema";
import { getBudgetData } from "@/lib/budget/queries";
import {
  budgetApprovalFingerprint,
  budgetApprovalTotal,
} from "@/lib/budget/approval-fingerprint";
import { notifyMany } from "@/lib/notifications";
import { canSendBudgetProposal } from "@/lib/budget/approval-rules";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type BudgetApprovalSnapshot = {
  fingerprint: string;
  currency: string;
  totalAmount: string;
};

export async function getBudgetApprovalSnapshot(
  projectId: string,
  printRunId?: string | null
): Promise<BudgetApprovalSnapshot> {
  const { settings, items, presentation } = await getBudgetData(
    projectId,
    printRunId ?? undefined
  );
  return {
    fingerprint: budgetApprovalFingerprint(settings, items, presentation),
    currency: settings.currency || "USD",
    totalAmount: budgetApprovalTotal(items, presentation),
  };
}

async function insertApprovalTask(
  tx: Tx,
  input: {
    projectId: string;
    projectTitle: string;
    approverId: string;
    requesterId: string;
    dueDate: string;
    revised?: boolean;
  }
): Promise<string> {
  const [task] = await tx
    .insert(tasks)
    .values({
      projectId: input.projectId,
      title: `${input.revised ? "Re-approve" : "Approve"} budget — ${input.projectTitle}`,
      description:
        "Review the current project quotation, then use the dedicated Approve or Request changes action. This task cannot be completed with ordinary task controls.",
      status: "todo",
      priority: "high",
      assignedTo: input.approverId,
      createdBy: input.requesterId,
      dueDate: input.dueDate,
      dueDateIsManual: true,
    })
    .returning({ id: tasks.id });
  return task.id;
}

async function projectLabel(projectId: string) {
  const [project] = await db
    .select({ title: projects.title, slug: projects.slug })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return project ?? null;
}

/**
 * Bring the active approval round in step with the current quotation. Terminal
 * rounds become immutable history; an in-flight pending round is reused so a
 * cluster of edits does not create noisy history.
 */
export async function syncBudgetApprovalState(
  projectId: string,
  printRunId?: string | null
) {
  const scopeCondition = printRunId
    ? eq(budgetApprovalRequests.printRunId, printRunId)
    : isNull(budgetApprovalRequests.printRunId);
  const [snapshot, project, current] = await Promise.all([
    getBudgetApprovalSnapshot(projectId, printRunId),
    projectLabel(projectId),
    db
      .select()
      .from(budgetApprovalRequests)
      .where(
        and(
          eq(budgetApprovalRequests.projectId, projectId),
          scopeCondition,
          ne(budgetApprovalRequests.status, "superseded")
        )
      )
      .orderBy(desc(budgetApprovalRequests.createdAt))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ]);

  if (!current || current.fingerprint === snapshot.fingerprint || !project) {
    return { snapshot, requestId: current?.id ?? null, changed: false };
  }

  const oldAssignments = await db
    .select()
    .from(budgetApprovalAssignments)
    .where(eq(budgetApprovalAssignments.requestId, current.id));
  const repeatApproverIds: string[] = [];
  let requestId = current.id;

  await db.transaction(async (tx) => {
    if (current.status === "pending") {
      repeatApproverIds.push(
        ...oldAssignments
          .filter((assignment) => assignment.decision === "approved")
          .map((assignment) => assignment.approverId)
      );
      await tx
        .update(budgetApprovalRequests)
        .set({
          fingerprint: snapshot.fingerprint,
          currency: snapshot.currency,
          totalAmount: snapshot.totalAmount,
          approvedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(budgetApprovalRequests.id, current.id));
      await tx
        .update(budgetApprovalAssignments)
        .set({
          decision: "pending",
          changeNote: null,
          decidedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(budgetApprovalAssignments.requestId, current.id));
      const taskIds = oldAssignments.map((assignment) => assignment.taskId);
      if (taskIds.length > 0) {
        await tx
          .update(tasks)
          .set({ status: "todo", completedAt: null, updatedAt: new Date() })
          .where(inArray(tasks.id, taskIds));
      }
      return;
    }

    repeatApproverIds.push(
      ...oldAssignments.map((assignment) => assignment.approverId)
    );
    await tx
      .update(budgetApprovalRequests)
      .set({
        status: "superseded",
        supersededFromStatus:
          current.status === "superseded" ? null : current.status,
        supersededAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(budgetApprovalRequests.id, current.id));

    const [next] = await tx
      .insert(budgetApprovalRequests)
      .values({
        projectId,
        printRunId: printRunId ?? null,
        requesterId: current.requesterId,
        dueDate: current.dueDate,
        fingerprint: snapshot.fingerprint,
        currency: snapshot.currency,
        totalAmount: snapshot.totalAmount,
        status: "pending",
      })
      .returning({ id: budgetApprovalRequests.id });
    requestId = next.id;

    for (const assignment of oldAssignments) {
      const taskId = await insertApprovalTask(tx, {
        projectId,
        projectTitle: project.title,
        approverId: assignment.approverId,
        requesterId: current.requesterId,
        dueDate: current.dueDate,
        revised: true,
      });
      await tx.insert(budgetApprovalAssignments).values({
        requestId: next.id,
        approverId: assignment.approverId,
        taskId,
      });
    }
  });

  if (repeatApproverIds.length > 0) {
    await notifyMany(repeatApproverIds, {
      type: "budget_approval_reset",
      title: "Budget approval requested again",
      body: "The quotation changed. Review the current budget again.",
      project: project.title,
      link: `/projects/${project.slug}/budget${
        printRunId ? `?run=${printRunId}` : ""
      }#budget-approval`,
      data: { projectId, approvalRequestId: requestId },
    });
  }

  return { snapshot, requestId, changed: true };
}

export async function currentBudgetApprovalAuthorization(
  projectId: string,
  printRunId?: string | null
) {
  const synced = await syncBudgetApprovalState(projectId, printRunId);
  if (!synced.requestId) {
    return {
      ok: true as const,
      approvalRequired: false as const,
      requestId: null,
      fingerprint: synced.snapshot.fingerprint,
      snapshot: synced.snapshot,
    };
  }
  const [request] = await db
    .select()
    .from(budgetApprovalRequests)
    .where(eq(budgetApprovalRequests.id, synced.requestId))
    .limit(1);
  if (
    !request ||
    !canSendBudgetProposal({
      status: request.status,
      approvedFingerprint: request.fingerprint,
      currentFingerprint: synced.snapshot.fingerprint,
    })
  ) {
    return {
      ok: false as const,
      error:
        request?.status === "changes_requested"
          ? "Revise the budget and receive unanimous approval before sending."
          : "Every assigned approver must approve the current budget before sending.",
    };
  }
  return {
    ok: true as const,
    approvalRequired: true as const,
    requestId: request.id,
    fingerprint: request.fingerprint,
    snapshot: synced.snapshot,
  };
}

export { insertApprovalTask };
