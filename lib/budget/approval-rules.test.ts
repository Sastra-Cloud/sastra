import { describe, expect, it } from "vitest";

import {
  approvalStatusForDecisions,
  canSendBudgetProposal,
} from "@/lib/budget/approval-rules";

describe("budget approval rules", () => {
  it("requires every selected approver", () => {
    expect(approvalStatusForDecisions(["approved", "pending"])).toBe("pending");
    expect(approvalStatusForDecisions(["approved", "approved"])).toBe("approved");
  });

  it("lets a change request block the round", () => {
    expect(
      approvalStatusForDecisions(["approved", "changes_requested", "pending"])
    ).toBe("changes_requested");
  });

  it("allows sending when approval has not been set up", () => {
    expect(
      canSendBudgetProposal({
        status: null,
        approvedFingerprint: null,
        currentFingerprint: "current",
      })
    ).toBe(true);
  });

  it("requires the exact approved fingerprint once approval is set up", () => {
    expect(
      canSendBudgetProposal({
        status: "approved",
        approvedFingerprint: "current",
        currentFingerprint: "current",
      })
    ).toBe(true);
    expect(
      canSendBudgetProposal({
        status: "approved",
        approvedFingerprint: "old",
        currentFingerprint: "current",
      })
    ).toBe(false);
    expect(
      canSendBudgetProposal({
        status: "pending",
        approvedFingerprint: "current",
        currentFingerprint: "current",
      })
    ).toBe(false);
  });
});
