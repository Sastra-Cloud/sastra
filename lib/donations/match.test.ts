import { describe, expect, it } from "vitest";

import { buildDonationSuggestion } from "./match";
import { initialDonationAllocationDrafts } from "./allocation-draft";

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
          currency: "USD",
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
    const suggestedAllocations = structuredClone(result.allocations);
    expect(initialDonationAllocationDrafts({
      id: "donation", amount: "13742.00", currency: "USD",
      allocations: [], suggestion: result,
    }, [], [])).toEqual(suggestedAllocations);
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
          currency: "USD",
          counterparty: "Northstar Foundation",
          invoiceNumber: "1001",
        },
        {
          id: "payment-b",
          projectId: "project-b",
          projectTitle: "Community Learning Labs",
          amountCents: 250_000,
          currency: "USD",
          counterparty: "Northstar Foundation",
          invoiceNumber: "1002",
        },
      ],
    });
    expect(result.confidence).toBe("strong");
    const drafts = initialDonationAllocationDrafts({
      id: "donation", amount: "7000.00", currency: "USD",
      allocations: [], suggestion: result,
    }, [], []);
    expect(drafts.map((row) => row.amount)).toEqual([
      "4500.00",
      "2500.00",
    ]);
    expect(drafts.map((row) => row.mouPaymentId)).toEqual(["payment-a", "payment-b"]);
  });

  it("uses the project named in the note ahead of an unrelated exact amount", () => {
    const result = buildDonationSuggestion({
      donation: {
        id: "donation",
        donor: "Anonymous Donor",
        amountCents: 100_000,
        notes: "Please use this for the Northstar Reading Initiative.",
      },
      projects,
      receivables: [{
        id: "unrelated-payment", projectId: projects[1].id, projectTitle: projects[1].title,
        amountCents: 100_000, currency: "USD", counterparty: null, invoiceNumber: null,
      }],
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

  // A missing partner used to hide these exact payments behind unrelated
  // donation history, forcing admins to find and enter the project manually.
  it.each([
    { title: "Pray Big", amountCents: 792_892, amount: "7928.92" },
    { title: "The Man on the Middle Cross", amountCents: 270_865, amount: "2708.65" },
  ])("prefills the unique exact expected payment for $title without a saved partner", ({ title, amountCents, amount }) => {
    const target = { ...projects[0], id: "target", title, partnerName: null };
    const result = buildDonationSuggestion({
      donation: { id: "donation", donor: "Giving Platform", amountCents, currency: "USD", notes: null },
      projects: [...projects.map((project) => ({ ...project, priorAllocationCount: 1 })), target],
      receivables: [{
        id: "expected", projectId: target.id, projectTitle: title,
        amountCents, currency: "USD", counterparty: null, invoiceNumber: null,
      }],
      sharedReceivables: [],
      promises: [{
        proposalId: "unanswered", projectId: projects[0].id, projectTitle: projects[0].title,
        partner: "Giving Platform", answered: false, outstandingCents: null,
      }],
    });
    expect(result.confidence).toBe("possible");
    expect(result.candidateProjectIds).toEqual(["target"]);
    expect(initialDonationAllocationDrafts({
      id: "donation", amount, currency: "USD", allocations: [], suggestion: result,
    }, [], [])).toMatchObject([
      { projectId: "target", amount, mouPaymentId: "expected" },
    ]);
  });

  const exactInput = {
    donation: { id: "donation", donor: "Northstar Foundation", amountCents: 50_000, currency: "USD", notes: null },
    projects,
    sharedReceivables: [],
    receivables: [{
      id: "payment-a", projectId: projects[0].id, projectTitle: projects[0].title,
      amountCents: 50_000, currency: "USD", counterparty: null, invoiceNumber: null,
    }],
  };

  it.each([null, "Northstar Foundation"])("leaves tied exact payments unallocated (partner: %s)", (counterparty) => {
    const first = { ...exactInput.receivables[0], counterparty };
    const second = { ...first, id: "payment-b", projectId: projects[1].id, projectTitle: projects[1].title };
    for (const receivables of [[first, second], [second, first]]) {
      const result = buildDonationSuggestion({ ...exactInput, receivables });
      expect(result.confidence).toBe("possible");
      expect(result.allocations).toEqual([]);
      expect(result.candidateProjectIds.toSorted()).toEqual(["project-a", "project-b"]);
    }
  });

  it("uses donor or note evidence to resolve equal amounts", () => {
    const first = { ...exactInput.receivables[0], counterparty: "Northstar Foundation" };
    const second = { ...first, id: "payment-b", projectId: projects[1].id, projectTitle: projects[1].title, counterparty: null };
    const result = buildDonationSuggestion({ ...exactInput, receivables: [second, first] });
    expect(result.confidence).toBe("strong");
    expect(result.allocations[0].mouPaymentId).toBe("payment-a");

    const withNote = buildDonationSuggestion({
      ...exactInput,
      donation: { ...exactInput.donation, notes: `For ${projects[1].title}` },
      receivables: [first, { ...second, counterparty: "Northstar Foundation" }],
    });
    expect(withNote.confidence).toBe("strong");
    expect(withNote.allocations[0].mouPaymentId).toBe("payment-b");
  });

  it("does not link another currency or nonpositive payments", () => {
    const wrongCurrency = buildDonationSuggestion({
      ...exactInput,
      receivables: [{ ...exactInput.receivables[0], currency: "EUR", counterparty: "Northstar Foundation" }],
    });
    expect(wrongCurrency.allocations).toEqual([]);
    for (const amountCents of [0, -50_000]) {
      const result = buildDonationSuggestion({
        ...exactInput,
        donation: { ...exactInput.donation, amountCents },
        receivables: [{ ...exactInput.receivables[0], amountCents, counterparty: "Northstar Foundation" }],
      });
      expect(result.allocations.some((row) => row.mouPaymentId)).toBe(false);
    }
  });

  it("preserves a reviewed shared split for a unique amount and exposes collisions with individual payments", () => {
    const shared = {
      paymentId: "shared-payment", groupId: "group", groupName: "Shared agreement", counterparty: null,
      amountCents: 50_000, currency: "USD",
      members: projects.map((project) => ({ projectId: project.id, projectTitle: project.title, allocationCents: 25_000 })),
    };
    const result = buildDonationSuggestion({ ...exactInput, receivables: [], sharedReceivables: [shared] });
    expect(result.confidence).toBe("possible");
    expect(result.allocations).toMatchObject([
      { projectId: "project-a", amount: "250.00", mouPaymentId: "shared-payment", sharedMouGroupId: "group" },
      { projectId: "project-b", amount: "250.00", mouPaymentId: "shared-payment", sharedMouGroupId: "group" },
    ]);
    const ambiguous = buildDonationSuggestion({ ...exactInput, sharedReceivables: [shared] });
    expect(ambiguous.allocations).toEqual([]);
    expect(ambiguous.candidateProjectIds.toSorted()).toEqual(["project-a", "project-b"]);
  });

  it("keeps identity-backed payment combinations and promised amounts ahead of an unrelated exact amount", () => {
    const receivables = [
      exactInput.receivables[0],
      { ...exactInput.receivables[0], id: "part-a", amountCents: 30_000, counterparty: "Northstar Foundation" },
      { ...exactInput.receivables[0], id: "part-b", amountCents: 20_000, counterparty: "Northstar Foundation" },
    ];
    const split = buildDonationSuggestion({ ...exactInput, receivables });
    expect(split.confidence).toBe("strong");
    expect(split.allocations.map((row) => row.mouPaymentId)).toEqual(["part-a", "part-b"]);
    const promised = buildDonationSuggestion({
      ...exactInput,
      promises: [{
        proposalId: "promise", projectId: projects[1].id, projectTitle: projects[1].title,
        partner: "Northstar Foundation", answered: true, outstandingCents: 50_000,
      }],
    });
    expect(promised.confidence).toBe("strong");
    expect(promised.allocations).toMatchObject([{ projectId: "project-b", amount: "500.00", mouPaymentId: null }]);
  });

  it("suggests the project whose proposal the donor answered with a donation", () => {
    const promise = {
      proposalId: "proposal-a",
      projectId: "project-a",
      projectTitle: "Northstar Reading Initiative",
      partner: "Grace Church",
      answered: true,
      outstandingCents: 50_000,
    };
    const base = {
      donation: { id: "donation", donor: "Grace Church", amountCents: 50_000, notes: null },
      projects,
      receivables: [],
      sharedReceivables: [],
    };
    const promised = buildDonationSuggestion({ ...base, promises: [promise] });
    expect(promised.confidence).toBe("strong");
    expect(promised.allocations).toMatchObject([
      { projectId: "project-a", amount: "500.00", mouPaymentId: null },
    ]);

    // A proposal still waiting for an answer is only a possible match.
    const waiting = buildDonationSuggestion({
      ...base,
      promises: [{ ...promise, answered: false, outstandingCents: null }],
    });
    expect(waiting.confidence).toBe("possible");
    expect(waiting.allocations).toHaveLength(1);
  });

  it("splits one gift across books only when the promised donations add up", () => {
    const promises = [
      { proposalId: "a", projectId: "project-a", projectTitle: "A", partner: "Grace Church", answered: true, outstandingCents: 30_000 },
      { proposalId: "b", projectId: "project-b", projectTitle: "B", partner: "Grace Church", answered: true, outstandingCents: 20_000 },
    ];
    const suggest = (amountCents: number) =>
      buildDonationSuggestion({
        donation: { id: "donation", donor: "Grace Church", amountCents, notes: null },
        projects,
        receivables: [],
        sharedReceivables: [],
        promises,
      });
    expect(suggest(50_000).allocations.map((row) => row.amount)).toEqual(["300.00", "200.00"]);
    const unclear = suggest(45_000);
    expect(unclear.allocations).toEqual([]);
    expect(unclear.candidateProjectIds).toEqual(["project-a", "project-b"]);
  });
});
