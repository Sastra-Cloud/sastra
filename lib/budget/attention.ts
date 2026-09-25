export type BudgetAttentionSeverity = "critical" | "warning" | "info";

export type BudgetAttentionItem = {
  id: "approval" | "funding" | "receivables" | "reconciliation" | "setup";
  severity: BudgetAttentionSeverity;
  label: string;
  value: string;
  href: `#${string}`;
};

export type BudgetAttentionSummary = {
  items: BudgetAttentionItem[];
  nextAction: { label: string; href: `#${string}` } | null;
};

export function formatBudgetMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(0)}`;
  }
}

export function buildBudgetAttentionSummary(input: {
  currency: string;
  quotationTotalCents: number;
  committedFundingCents: number;
  approvalStatus: "pending" | "approved" | "changes_requested" | "superseded" | null;
  pendingApprovalCount: number;
  overdueReceivableCount: number;
  overdueReceivableCents: number;
  reconciliationIssueCount: number;
}): BudgetAttentionSummary {
  const items: BudgetAttentionItem[] = [];

  if (input.approvalStatus === "changes_requested") {
    items.push({
      id: "approval",
      severity: "critical",
      label: "Approval changes requested",
      value: "Revise and resubmit the quotation",
      href: "#decisions",
    });
  } else if (input.approvalStatus === "pending") {
    items.push({
      id: "approval",
      severity: "warning",
      label: "Budget approval pending",
      value: `${input.pendingApprovalCount || 1} decision${input.pendingApprovalCount === 1 ? "" : "s"} remaining`,
      href: "#decisions",
    });
  }

  const fundingRemainingCents = Math.max(
    0,
    input.quotationTotalCents - input.committedFundingCents
  );
  if (fundingRemainingCents > 0) {
    items.push({
      id: "funding",
      severity: "info",
      label: "Funding remaining",
      value: formatBudgetMoney(fundingRemainingCents, input.currency),
      href: "#planning",
    });
  }

  if (input.overdueReceivableCount > 0) {
    items.push({
      id: "receivables",
      severity: "critical",
      label: "Overdue receivables",
      value: `${input.overdueReceivableCount} totaling ${formatBudgetMoney(input.overdueReceivableCents, input.currency)}`,
      href: "#cash-reconciliation",
    });
  }

  if (input.reconciliationIssueCount > 0) {
    items.push({
      id: "reconciliation",
      severity: "warning",
      label: "Reconciliation needs review",
      value: `${input.reconciliationIssueCount} issue${input.reconciliationIssueCount === 1 ? "" : "s"}`,
      href: "#cash-reconciliation",
    });
  }

  const next =
    items.find((item) => item.severity === "critical") ??
    items.find((item) => item.severity === "warning") ??
    items[0];

  return {
    items,
    nextAction: next ? { label: next.label, href: next.href } : null,
  };
}
