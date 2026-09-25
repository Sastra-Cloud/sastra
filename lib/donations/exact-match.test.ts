import { describe, expect, it } from "vitest";

import { applyUniqueExactMouMatch } from "./exact-match";
import type { DonationAllocationDraft, DonationMouPaymentOption } from "./types";

const allocation: DonationAllocationDraft = {
  key: "allocation",
  projectId: "project-a",
  projectTitle: "Project A",
  amount: "21052.00",
  mouPaymentId: null,
  sharedMouGroupId: null,
  evidence: [],
};

const payment: DonationMouPaymentOption = {
  id: "payment-a",
  projectId: "project-a",
  amount: "21052.00",
  currency: "USD",
  label: "On signing",
};

describe("exact donation-to-MoU matching", () => {
  it("links one exact project, amount, and currency match", () => {
    expect(applyUniqueExactMouMatch(allocation, "USD", [payment])).toMatchObject({
      mouPaymentId: "payment-a",
      evidence: ["Amount matches On signing."],
    });
  });

  it("does not choose between ambiguous exact payments", () => {
    const result = applyUniqueExactMouMatch(allocation, "USD", [
      payment,
      { ...payment, id: "payment-b", label: "On completion" },
    ]);
    expect(result.mouPaymentId).toBeNull();
  });

  it("does not match a different currency", () => {
    const result = applyUniqueExactMouMatch(allocation, "KHR", [payment]);
    expect(result.mouPaymentId).toBeNull();
  });

  it("preserves an already reviewed payment link", () => {
    const linked = { ...allocation, mouPaymentId: "reviewed-payment" };
    expect(applyUniqueExactMouMatch(linked, "USD", [])).toBe(linked);
  });
});
