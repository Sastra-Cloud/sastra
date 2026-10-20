import { describe, expect, it } from "vitest";
import { planBudgetLineInvoice } from "./line-invoice";

const projectId = "00000000-0000-4000-8000-000000000001";
const audioId = "00000000-0000-4000-8000-000000000002";
const printId = "00000000-0000-4000-8000-000000000003";
const input = { projectId, budgetItemIds: [audioId] };
const context = {
  projectTitle: "Example book", currency: "USD",
  recipientName: "Partner", recipientEmail: "partner@example.org", recipientAddress: "Saved address",
  items: [
    { id: audioId, label: "Internal recording cost", partnerLabel: "Audiobook Production", partnerVisible: true, quantity: "59000", unitPrice: "0.008", partnerUnitPrice: "0.01" },
    { id: printId, label: "Printing", partnerLabel: null, partnerVisible: true, quantity: "1000", unitPrice: "2", partnerUnitPrice: null },
  ],
};

describe("selected budget cost invoices", () => {
  it("invoices only the requested public cost without leaking internal labels or changing other costs", () => {
    const plan = planBudgetLineInvoice(input, context);
    expect(plan.amount).toBe("590.00");
    expect(plan.lines).toEqual([{ id: audioId, description: "Audiobook Production", amountCents: 59000 }]);
    expect(plan.description).toContain("Example book");
    expect(plan.description).not.toContain("Internal");
    expect(plan.description).not.toContain("Printing");
    expect(context.items[1].unitPrice).toBe("2");
  });

  it("allows an explicit partial contribution but rejects amounts above the selected public costs", () => {
    expect(planBudgetLineInvoice({ ...input, amount: 200 }, context)).toMatchObject({ amount: "200.00", total: "590.00" });
    expect(() => planBudgetLineInvoice({ ...input, amount: 591 }, context)).toThrow("no more than");
    expect(() => planBudgetLineInvoice({ ...input, amount: 0.001 }, context)).toThrow("greater than zero");
  });

  it("rejects hidden, foreign-scope, and duplicate ids instead of silently expanding the invoice", () => {
    expect(() => planBudgetLineInvoice(input, { ...context, items: [{ ...context.items[0], partnerVisible: false }] })).toThrow("visible partner lines");
    expect(() => planBudgetLineInvoice({ ...input, budgetItemIds: [printId] }, { ...context, items: [context.items[0]] })).toThrow("this budget");
    expect(() => planBudgetLineInvoice({ ...input, budgetItemIds: [audioId, audioId] }, context)).toThrow("only once");
  });

  it("requires another review when price, public wording, or recipient changes", () => {
    const original = planBudgetLineInvoice(input, context).fingerprint;
    expect(planBudgetLineInvoice(input, { ...context, items: [{ ...context.items[0], partnerUnitPrice: "0.02" }] }).fingerprint).not.toBe(original);
    expect(planBudgetLineInvoice(input, { ...context, items: [{ ...context.items[0], partnerLabel: "Video" }] }).fingerprint).not.toBe(original);
    const changed = planBudgetLineInvoice({ ...input, recipientName: "Another partner" }, context);
    expect(changed.fingerprint).not.toBe(original);
    expect(changed.recipientAddress).toBe("");
    expect(changed.recipientEmail).toBeNull();
  });
});
