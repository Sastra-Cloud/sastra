import type {
  BudgetApprovalDecision,
  BudgetApprovalRequestStatus,
} from "@/lib/db/schema/budget";

export function approvalStatusForDecisions(
  decisions: BudgetApprovalDecision[]
): Extract<
  BudgetApprovalRequestStatus,
  "pending" | "approved" | "changes_requested"
> {
  if (decisions.some((decision) => decision === "changes_requested")) {
    return "changes_requested";
  }
  return decisions.length > 0 && decisions.every((decision) => decision === "approved")
    ? "approved"
    : "pending";
}

export function canSendBudgetProposal(input: {
  status: BudgetApprovalRequestStatus | null;
  approvedFingerprint: string | null;
  currentFingerprint: string;
}) {
  if (input.status === null) return true;
  return (
    input.status === "approved" &&
    input.approvedFingerprint === input.currentFingerprint
  );
}
