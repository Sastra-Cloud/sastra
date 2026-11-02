import { expect, it } from "vitest";
import { proposalCostRows, proposalCostTotalCents, proposalBudgetSchema, type ProposalBudgetInput } from "./proposal-builder";

const input: ProposalBudgetInput = {
  requestId: "10000000-0000-4000-8000-000000000001", title: "Proposed book", kind: "book", description: "",
  sourceLanguage: "", targetLanguage: "", currency: "EUR", wordCount: 12000, sourcePageCount: 80,
  wordsPerPage: 200, languageExpansionFactor: "1.50", lines: [
    { category: "translation", label: "Translation", unit: "words", quantity: 999, unitPrice: 0.0125, autoQuantity: true },
    { category: "typesetting", label: "Typesetting", unit: "pages", quantity: 0, unitPrice: 2.5, autoQuantity: true },
    { category: "custom", label: "Freight estimate", unit: "flat", quantity: 2, unitPrice: 12.25, autoQuantity: false },
  ],
};

it("uses the reviewed word/page basis for both the live total and saved estimate, preserving manual costs", () => {
  const rows = proposalCostRows(input, input);
  expect(rows.map(row => [row.quantity, row.amount])).toEqual([[12000, "150.00"], [120, "300.00"], [2, "24.50"]]);
  expect(proposalCostTotalCents(rows)).toBe(47450);
  const unknown = { ...input, wordCount: 0, sourcePageCount: 0 };
  expect(proposalCostRows(unknown, unknown).map(row => row.quantity)).toEqual([0, 0, 2]);
  expect(proposalCostRows({ ...input, sourcePageCount: 0 }, input)[1].quantity).toBe(90);
});

it("rejects rates that would lose stored precision and unsafe quantity/rate products before saving", () => {
  expect(proposalBudgetSchema.safeParse(input).success).toBe(true);
  expect(proposalBudgetSchema.safeParse({ ...input, lines: [{ ...input.lines[0], unitPrice: 0.01255 }] }).success).toBe(false);
  expect(proposalBudgetSchema.safeParse({ ...input, lines: [{ ...input.lines[0], quantity: 100_000_000, unitPrice: 1_000_000 }] }).success).toBe(false);
});
