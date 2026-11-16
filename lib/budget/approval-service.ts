import "server-only";

import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  budgetApprovalAssignments,
  budgetApprovalRequests,
  projects,
  tasks,
} from "@/lib/db/schema";
import { createHash } from "node:crypto";
import {
  partnerQuotationVersion,
  quotationTotalCents,
  PartnerQuotationError,
} from "./partner-quotations";
import { listPartnerQuotations } from "./partner-quotation-queries";
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
  quotationTitle?: string;
};

export async function getBudgetApprovalSnapshot(
  projectId: string,
  printRunId?: string | null,
  quotationId?: string | null,
): Promise<BudgetApprovalSnapshot> {
  const { settings, items, presentation } = await getBudgetData(
    projectId,
    printRunId ?? undefined,
  );
  const quotations = await listPartnerQuotations(projectId, printRunId);
  if (quotationId) {
    const quote = quotations.find((q) => q.id === quotationId);
    if (!quote)
      throw new PartnerQuotationError(
        "Partner quotation not found in this budget.",
      );
    return {
      fingerprint: createHash("sha256")
        .update(
          JSON.stringify([
            budgetApprovalFingerprint(settings, items, presentation),
            partnerQuotationVersion(quote),
          ]),
        )
        .digest("hex"),
      quotationTitle: quote.title,
      currency: quote.currency,
      totalAmount: (quotationTotalCents(quote) / 100).toFixed(2),
    };
  }
  return {
    fingerprint: budgetApprovalFingerprint(
      settings,
      items,
      presentation,
      quotations,
    ),
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
    quotationTitle?: string;
  },
): Promise<string> {
  const [task] = await tx
    .insert(tasks)
    .values({
      projectId: input.projectId,
      title: `${input.revised ? "Re-approve" : "Approve"} ${input.quotationTitle ? `proposal: ${input.quotationTitle}` : "budget"} — ${input.projectTitle}`,
      description: input.quotationTitle
        ? `Review “${input.quotationTitle}”, its partner, costs, currency, and attachment. Choose Approve proposal or Request changes. Approval does not send the email.`
        : "Review the current project quotation and its attachment. Choose Approve budget or Request changes. Approval does not send the email.",
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
  printRunId?: string | null,
  quotationId?: string | null,
) {
  const scopeCondition = printRunId
    ? eq(budgetApprovalRequests.printRunId, printRunId)
    : isNull(budgetApprovalRequests.printRunId);
  const [snapshot, project, current] = await Promise.all([
    getBudgetApprovalSnapshot(projectId, printRunId, quotationId),
    projectLabel(projectId),
    db
      .select()
      .from(budgetApprovalRequests)
      .where(
        and(
          eq(budgetApprovalRequests.projectId, projectId),
          scopeCondition,
          quotationId
            ? eq(budgetApprovalRequests.partnerQuotationId, quotationId)
            : isNull(budgetApprovalRequests.partnerQuotationId),
          ne(budgetApprovalRequests.status, "superseded"),
        ),
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
          .map((assignment) => assignment.approverId),
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
      ...oldAssignments.map((assignment) => assignment.approverId),
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
        partnerQuotationId: quotationId ?? null,
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
        quotationTitle: snapshot.quotationTitle,
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
      title: quotationId
        ? "Proposal approval requested again"
        : "Budget approval requested again",
      body: quotationId
        ? "The proposal changed. Review the current quotation again."
        : "The quotation changed. Review the current budget again.",
      project: project.title,
      link: `/projects/${project.slug}/budget${
        printRunId ? `?run=${printRunId}` : ""
      }#${quotationId ? `proposal-${quotationId}` : "budget-approval"}`,
      data: { projectId, approvalRequestId: requestId },
    });
  }

  return { snapshot, requestId, changed: true };
}

type ApprovalAuthorization =
  | {
      ok: true;
      approvalRequired: boolean;
      requestId: string | null;
      fingerprint: string;
      snapshot: BudgetApprovalSnapshot;
    }
  | { ok: false; error: string };

export async function currentBudgetApprovalAuthorization(
  projectId: string,
  printRunId?: string | null,
  quotationId?: string | null,
): Promise<ApprovalAuthorization> {
  const wholeBudget = quotationId
    ? await currentBudgetApprovalAuthorization(projectId, printRunId)
    : null;
  if (wholeBudget && !wholeBudget.ok) return wholeBudget;
  const synced = await syncBudgetApprovalState(
    projectId,
    printRunId,
    quotationId,
  );
  if (!synced.requestId && wholeBudget) return wholeBudget;
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
          : quotationId
            ? "Every assigned approver must approve this proposal before sending."
            : "Every assigned approver must approve the current budget before sending.",
    };
  }
  return {
    ok: true as const,
    approvalRequired: true as const,
    requestId: request.id,
    fingerprint: wholeBudget
      ? JSON.stringify([
          wholeBudget.fingerprint,
          request.fingerprint,
          wholeBudget.requestId,
        ])
      : request.fingerprint,
    snapshot: synced.snapshot,
  };
}

export { insertApprovalTask };
