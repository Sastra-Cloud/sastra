import { expect, it } from "vitest";

import { planProposalAnswer, proposalAnswerInput } from "./answer-plan";

const id = "5b0f3c9e-6f0f-4c0a-9a53-0c6b3a2f1d11";
const plan = (
  input: Record<string, unknown>,
  context: Partial<Parameters<typeof planProposalAnswer>[0]> = {}
) =>
  planProposalAnswer({
    input: proposalAnswerInput.parse({ proposalId: id, ...input }),
    proposal: { currency: "USD" },
    budgetCurrency: "USD",
    linkedPaymentCount: 0,
    today: "2026-11-09",
    ...context,
  });

it("splits an MoU answer into signing and completion payments that equal the agreed amount", () => {
  const result = plan({ answer: "mou", agreedAmount: 1000.01, schedule: "two" });
  expect(result).toMatchObject({
    patch: { status: "accepted", fundingPath: "mou", agreedAmount: "1000.01", answeredOn: "2026-11-09" },
    basis: "mou",
    payments: [
      { amount: "500.00", trigger: "on_signing" },
      { amount: "500.01", trigger: "on_completion" },
    ],
  });
});

it("never adds expected payments twice for the same proposal", () => {
  const result = plan(
    { answer: "no_mou", agreedAmount: 800, schedule: "one" },
    { linkedPaymentCount: 1 }
  );
  expect(result).toMatchObject({ basis: "no_mou", payments: [] });
});

it("requires an agreed amount for a set promise but not for a donation", () => {
  expect(plan({ answer: "no_mou", schedule: "one" })).toEqual({
    error: "Enter the amount the partner agreed to.",
  });
  expect(plan({ answer: "donation", schedule: "two" })).toMatchObject({
    patch: { status: "accepted", fundingPath: "donation", agreedAmount: null },
    payments: [],
  });
});

it("does not schedule payments in a currency the budget no longer uses", () => {
  const result = plan(
    { answer: "mou", agreedAmount: 500, schedule: "one" },
    { budgetCurrency: "KHR" }
  );
  expect(result).toHaveProperty("error");
});

it("clears the funding path when a partner declines or the answer is reopened", () => {
  expect(plan({ answer: "declined", agreedAmount: 500 })).toMatchObject({
    patch: { status: "declined", fundingPath: null, agreedAmount: null },
    payments: [],
  });
  expect(plan({ answer: "waiting" })).toMatchObject({
    patch: { status: "sent", fundingPath: null, answeredOn: null },
  });
});
