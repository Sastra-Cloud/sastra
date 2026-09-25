import { describe, expect, it } from "vitest";

import { buildBudgetAttentionSummary } from "@/lib/budget/attention";

describe("buildBudgetAttentionSummary", () => {
  it("prioritizes requested approval changes over other exceptions", () => {
    const summary = buildBudgetAttentionSummary({
      currency: "USD",
      quotationTotalCents: 10_000,
      committedFundingCents: 2_000,
      approvalStatus: "changes_requested",
      pendingApprovalCount: 1,
      overdueReceivableCount: 2,
      overdueReceivableCents: 3_000,
      reconciliationIssueCount: 1,
    });

    expect(summary.items.map((item) => item.id)).toEqual([
      "approval",
      "funding",
      "receivables",
      "reconciliation",
    ]);
    expect(summary.nextAction).toEqual({
      label: "Approval changes requested",
      href: "#decisions",
    });
  });

  it("uses overdue receivables as the next action when approval is clear", () => {
    const summary = buildBudgetAttentionSummary({
      currency: "USD",
      quotationTotalCents: 5_000,
      committedFundingCents: 5_000,
      approvalStatus: "approved",
      pendingApprovalCount: 0,
      overdueReceivableCount: 1,
      overdueReceivableCents: 1_250,
      reconciliationIssueCount: 0,
    });

    expect(summary.items).toHaveLength(1);
    expect(summary.items[0]).toMatchObject({
      id: "receivables",
      severity: "critical",
      href: "#cash-reconciliation",
    });
    expect(summary.nextAction?.href).toBe("#cash-reconciliation");
  });

  it("does not invent an action when nothing needs attention", () => {
    const summary = buildBudgetAttentionSummary({
      currency: "USD",
      quotationTotalCents: 5_000,
      committedFundingCents: 5_000,
      approvalStatus: null,
      pendingApprovalCount: 0,
      overdueReceivableCount: 0,
      overdueReceivableCents: 0,
      reconciliationIssueCount: 0,
    });

    expect(summary.items).toEqual([]);
    expect(summary.nextAction).toBeNull();
  });

  it("never reports negative funding remaining", () => {
    const summary = buildBudgetAttentionSummary({
      currency: "USD",
      quotationTotalCents: 5_000,
      committedFundingCents: 7_500,
      approvalStatus: null,
      pendingApprovalCount: 0,
      overdueReceivableCount: 0,
      overdueReceivableCents: 0,
      reconciliationIssueCount: 0,
    });

    expect(summary.items.find((item) => item.id === "funding")).toBeUndefined();
  });
});
