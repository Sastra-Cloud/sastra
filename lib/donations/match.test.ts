import { describe, expect, it } from "vitest";

import { buildDonationSuggestion } from "./match";

const projects = [
  {
    id: "project-a",
    title: "Northstar Reading Initiative",
    partnerName: "Northstar Foundation",
    budgetCents: 620_200,
    receivedCents: 0,
    priorAllocationCount: 0,
  },
  {
    id: "project-b",
    title: "Community Learning Labs",
    partnerName: "Northstar Foundation",
    budgetCents: 150_000,
    receivedCents: 0,
    priorAllocationCount: 0,
  },
];

describe("donation matching", () => {
  it("uses a reviewed shared MoU split for an exact payment", () => {
    const result = buildDonationSuggestion({
      donation: {
        id: "donation",
        donor: "Northstar Foundation",
        amountCents: 1_374_200,
        notes: null,
      },
      projects,
      receivables: [],
      sharedReceivables: [
        {
          paymentId: "payment",
          groupId: "group",
          groupName: "Northstar education agreement",
          counterparty: "Northstar Foundation",
          amountCents: 1_374_200,
          members: [
            {
              projectId: "project-a",
              projectTitle: "Northstar Reading Initiative",
              allocationCents: 620_200,
            },
            {
              projectId: "project-b",
              projectTitle: "Community Learning Labs",
              allocationCents: 150_000,
            },
          ],
        },
      ],
    });
    expect(result.confidence).toBe("strong");
    expect(result.allocations).toHaveLength(2);
    expect(
      result.allocations.reduce(
        (sum, allocation) => sum + Number(allocation.amount),
        0
      )
    ).toBe(13_742);
    expect(
      result.allocations.every(
        (allocation) => allocation.mouPaymentId === "payment"
      )
    ).toBe(true);
  });

  it("finds a combination of unpaid project payments", () => {
    const result = buildDonationSuggestion({
      donation: {
        id: "donation",
        donor: "Northstar Foundation",
        amountCents: 700_000,
        notes: null,
      },
      projects,
      sharedReceivables: [],
      receivables: [
        {
          id: "payment-a",
          projectId: "project-a",
          projectTitle: "Northstar Reading Initiative",
          amountCents: 450_000,
          counterparty: "Northstar Foundation",
          invoiceNumber: "1001",
        },
        {
          id: "payment-b",
          projectId: "project-b",
          projectTitle: "Community Learning Labs",
          amountCents: 250_000,
          counterparty: "Northstar Foundation",
          invoiceNumber: "1002",
        },
      ],
    });
    expect(result.confidence).toBe("strong");
    expect(result.allocations.map((row) => row.amount)).toEqual([
      "4500.00",
      "2500.00",
    ]);
  });

  it("uses a project title in the donation note as possible evidence", () => {
    const result = buildDonationSuggestion({
      donation: {
        id: "donation",
        donor: "Anonymous Donor",
        amountCents: 100_000,
        notes: "Please use this for the Northstar Reading Initiative.",
      },
      projects,
      receivables: [],
      sharedReceivables: [],
    });
    expect(result.confidence).toBe("possible");
    expect(result.allocations[0].projectId).toBe("project-a");
  });

  it("does not invent a split between several related projects", () => {
    const result = buildDonationSuggestion({
      donation: {
        id: "donation",
        donor: "Northstar Foundation",
        amountCents: 1_374_200,
        notes: null,
      },
      projects,
      receivables: [],
      sharedReceivables: [],
    });
    expect(result.confidence).toBe("possible");
    expect(result.allocations).toEqual([]);
    expect(result.candidateProjectIds).toEqual(["project-a", "project-b"]);
  });
});
