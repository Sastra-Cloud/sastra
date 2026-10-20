import { describe, expect, it } from "vitest";

import {
  initialDonationAllocationDrafts,
  remainingDonationAllocationAmount,
} from "./allocation-draft";
import type { DonationAllocationDraft, DonationSuggestion } from "./types";

const suggestion: DonationSuggestion = {
  confidence: "none",
  summary: "No reliable project match.",
  evidence: [],
  allocations: [],
  candidateProjectIds: [],
};
const donation = {
  id: "donation",
  amount: "2605.90",
  currency: "USD",
  allocations: [] as DonationAllocationDraft[],
  suggestion,
};
const allocation: DonationAllocationDraft = {
  key: "existing",
  projectId: "project-a",
  projectTitle: "Project A",
  amount: "1000.10",
  mouPaymentId: null,
  sharedMouGroupId: null,
  evidence: [],
};

describe("donation allocation drafts", () => {
  it("defaults an unmatched manual draft to the full amount without choosing a project", () => {
    expect(initialDonationAllocationDrafts(donation, [], [])).toMatchObject([
      { projectId: "", amount: "2605.90", mouPaymentId: null },
    ]);
  });

  it("keeps posted shares ahead of fresh suggestions without filling their balance", () => {
    const posted = { ...allocation };
    const result = initialDonationAllocationDrafts({
      ...donation,
      allocations: [posted],
      suggestion: { ...suggestion, allocations: [{ ...allocation, amount: "2605.90" }] },
    }, [], [{
      id: "new-unpaid-payment", projectId: "project-a", amount: "1000.10",
      currency: "USD", label: "New scheduled payment",
    }]);
    expect(result).toEqual([posted]);
    expect(remainingDonationAllocationAmount(donation.amount, result)).toBe("1605.80");
  });

  it("leaves ambiguous project shares blank instead of assigning the whole gift to one candidate", () => {
    const result = initialDonationAllocationDrafts({
      ...donation,
      suggestion: { ...suggestion, candidateProjectIds: ["project-a", "project-b"] },
    }, [], []);
    expect(result.map(({ projectId, amount }) => ({ projectId, amount }))).toEqual([
      { projectId: "project-a", amount: "" },
      { projectId: "project-b", amount: "" },
    ]);
  });

  it("fills only the available cents for a new or edited share and preserves the other shares", () => {
    const rows = [allocation, { ...allocation, key: "second", amount: "500.25" }];
    expect(remainingDonationAllocationAmount(donation.amount, rows)).toBe("1105.55");
    expect(remainingDonationAllocationAmount(donation.amount, rows, "second")).toBe("1605.80");
    expect(rows.map((row) => row.amount)).toEqual(["1000.10", "500.25"]);
    expect(remainingDonationAllocationAmount("0.30", [{ ...allocation, amount: "0.10" }])).toBe("0.20");
  });

  it("keeps refund defaults and the remainder negative", () => {
    expect(initialDonationAllocationDrafts({ ...donation, amount: "-2605.90" }, [], [])[0].amount).toBe("-2605.90");
    expect(remainingDonationAllocationAmount("-2605.90", [{ ...allocation, amount: "-1000.10" }])).toBe("-1605.80");
  });

  it("does not fill an unavailable or invalid balance", () => {
    expect(remainingDonationAllocationAmount("1000.10", [allocation])).toBe("");
    expect(remainingDonationAllocationAmount("100.00", [allocation])).toBe("");
    expect(remainingDonationAllocationAmount(donation.amount, [{ ...allocation, amount: "-100.00" }])).toBe("");
    expect(remainingDonationAllocationAmount(donation.amount, [{ ...allocation, amount: "invalid" }])).toBe("");
  });
});
