export type TaskAssignmentSource = "direct" | "system" | "unknown";

/** Direct includes a person's approved assistant action; generators use system. */
export function taskAssignmentFields(
  actorId: string | null,
  assigneeId: string | null,
  source: TaskAssignmentSource,
) {
  return {
    assignedBy: assigneeId ? actorId : null,
    assignedAt: assigneeId ? new Date() : null,
    assignmentSource: assigneeId ? source : ("unknown" as TaskAssignmentSource),
    assignmentDeferredAt: null,
  };
}

export type TaskAssignmentContext = {
  lectioManaged?: boolean;
  assignedTo?: string | null;
  assignedBy?: string | null;
  assignedAt?: Date | string | null;
  assignmentSource?: string;
  assignmentDeferredAt?: Date | string | null;
  printPaymentId?: string | null;
  royaltyPaymentId?: string | null;
  licenseFeePaymentId?: string | null;
  mouInvoicePaymentId?: string | null;
  approvalAssignmentId?: string | null;
};

export function isUndatedTeammateRequest(
  task: TaskAssignmentContext & { status: string; dueDate: string | null },
): boolean {
  return task.status === "todo" && task.dueDate === null &&
    task.assignmentSource === "direct" && Boolean(task.assignedTo) &&
    Boolean(task.assignedBy) && task.assignedBy !== task.assignedTo &&
    !task.lectioManaged && !task.printPaymentId && !task.royaltyPaymentId && !task.licenseFeePaymentId &&
    !task.mouInvoicePaymentId && !task.approvalAssignmentId;
}
