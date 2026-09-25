import "server-only";

import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/lib/db";
import {
  budgetApprovalAssignments,
  budgetApprovalRequests,
  user,
} from "@/lib/db/schema";
import { syncBudgetApprovalState } from "@/lib/budget/approval-service";

export type EligibleBudgetApprover = {
  id: string;
  name: string;
  role: "super_admin" | "admin" | "manager";
};

export async function listEligibleBudgetApprovers(
  excludeUserId?: string
): Promise<EligibleBudgetApprover[]> {
  const rows = await db
    .select({ id: user.id, name: user.name, role: user.role })
    .from(user)
    .where(
      and(
        eq(user.isActive, true),
        eq(user.isBot, false),
        inArray(user.role, ["manager", "admin", "super_admin"]),
        excludeUserId ? ne(user.id, excludeUserId) : undefined
      )
    )
    .orderBy(asc(user.name));
  return rows as EligibleBudgetApprover[];
}

export type BudgetApprovalAssignmentDTO = {
  id: string;
  approverId: string;
  approverName: string;
  taskId: string;
  decision: "pending" | "approved" | "changes_requested";
  changeNote: string | null;
  decidedAt: Date | null;
};

export type BudgetApprovalRoundDTO = {
  id: string;
  requesterId: string;
  requesterName: string;
  dueDate: string;
  fingerprint: string;
  currency: string;
  totalAmount: string;
  status: "pending" | "approved" | "changes_requested" | "superseded";
  supersededFromStatus: "pending" | "approved" | "changes_requested" | null;
  approvedAt: Date | null;
  supersededAt: Date | null;
  createdAt: Date;
  assignments: BudgetApprovalAssignmentDTO[];
};

const requester = alias(user, "budget_approval_requester");
const approver = alias(user, "budget_approval_approver");

async function hydrateRounds(
  rows: Omit<BudgetApprovalRoundDTO, "assignments">[]
): Promise<BudgetApprovalRoundDTO[]> {
  if (rows.length === 0) return [];
  const assignments = await db
    .select({
      id: budgetApprovalAssignments.id,
      requestId: budgetApprovalAssignments.requestId,
      approverId: budgetApprovalAssignments.approverId,
      approverName: approver.name,
      taskId: budgetApprovalAssignments.taskId,
      decision: budgetApprovalAssignments.decision,
      changeNote: budgetApprovalAssignments.changeNote,
      decidedAt: budgetApprovalAssignments.decidedAt,
    })
    .from(budgetApprovalAssignments)
    .innerJoin(approver, eq(approver.id, budgetApprovalAssignments.approverId))
    .where(
      inArray(
        budgetApprovalAssignments.requestId,
        rows.map((row) => row.id)
      )
    )
    .orderBy(asc(approver.name));
  const byRequest = new Map<string, BudgetApprovalAssignmentDTO[]>();
  for (const assignment of assignments) {
    const list = byRequest.get(assignment.requestId) ?? [];
    list.push(assignment);
    byRequest.set(assignment.requestId, list);
  }
  return rows.map((row) => ({
    ...row,
    assignments: byRequest.get(row.id) ?? [],
  }));
}

const roundSelect = {
  id: budgetApprovalRequests.id,
  requesterId: budgetApprovalRequests.requesterId,
  requesterName: requester.name,
  dueDate: budgetApprovalRequests.dueDate,
  fingerprint: budgetApprovalRequests.fingerprint,
  currency: budgetApprovalRequests.currency,
  totalAmount: budgetApprovalRequests.totalAmount,
  status: budgetApprovalRequests.status,
  supersededFromStatus: budgetApprovalRequests.supersededFromStatus,
  approvedAt: budgetApprovalRequests.approvedAt,
  supersededAt: budgetApprovalRequests.supersededAt,
  createdAt: budgetApprovalRequests.createdAt,
};

/** Read the synchronized active round and immutable superseded history. */
export async function getBudgetApprovalState(
  projectId: string,
  printRunId?: string | null
) {
  const sync = await syncBudgetApprovalState(projectId, printRunId);
  const scopeCondition = printRunId
    ? eq(budgetApprovalRequests.printRunId, printRunId)
    : isNull(budgetApprovalRequests.printRunId);
  const [activeRows, historyRows] = await Promise.all([
    db
      .select(roundSelect)
      .from(budgetApprovalRequests)
      .innerJoin(requester, eq(requester.id, budgetApprovalRequests.requesterId))
      .where(
        and(
          eq(budgetApprovalRequests.projectId, projectId),
          scopeCondition,
          ne(budgetApprovalRequests.status, "superseded")
        )
      )
      .orderBy(desc(budgetApprovalRequests.createdAt))
      .limit(1),
    db
      .select(roundSelect)
      .from(budgetApprovalRequests)
      .innerJoin(requester, eq(requester.id, budgetApprovalRequests.requesterId))
      .where(
        and(
          eq(budgetApprovalRequests.projectId, projectId),
          scopeCondition,
          eq(budgetApprovalRequests.status, "superseded")
        )
      )
      .orderBy(desc(budgetApprovalRequests.createdAt)),
  ]);
  const [active, history] = await Promise.all([
    hydrateRounds(activeRows).then((rounds) => rounds[0] ?? null),
    hydrateRounds(historyRows),
  ]);
  const outstanding =
    active?.assignments
      .filter((assignment) => assignment.decision !== "approved")
      .map((assignment) => assignment.approverName) ?? [];
  const approvalRequired = active !== null;
  const canSend =
    !approvalRequired ||
    (active.status === "approved" && outstanding.length === 0);
  const gateReason = canSend
    ? null
    : active?.status === "changes_requested"
      ? "The budget needs revision and unanimous re-approval."
      : active
        ? `Waiting for ${outstanding.join(", ") || "all assigned approvers"}.`
        : "Request and receive unanimous budget approval before sending.";

  return {
    active,
    history,
    approvalRequired,
    canSend,
    gateReason,
    synchronizedAfterChange: sync.changed,
    currentFingerprint: sync.snapshot.fingerprint,
  };
}
