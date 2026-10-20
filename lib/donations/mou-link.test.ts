import { describe, expect, it } from "vitest";
import { donationMouLinkOptions } from "./mou-link";

const receipt = { projectId: "project", printRunId: null, currency: "USD" };
const payment = {
  id: "first", projectId: "project", printRunId: null, amount: "2530.00",
  currency: "USD", paidAt: null, receiptId: null, sharedMouGroupId: null,
  trigger: "on_signing", dueDate: "2024-11-22", notes: "First installment",
};

describe("manual donation payment choices", () => {
  it("offers different amounts and leaves multiple installments as explicit choices", () => {
    const result = donationMouLinkOptions(receipt, [payment, { ...payment, id: "second", trigger: "on_completion", dueDate: "2026-04-01" }]);
    expect(result.map((option) => option.paymentId)).toEqual(["first", "second"]);
    expect(result[0]).toMatchObject({ amount: "2530.00", currency: "USD", label: "First installment · due 2024-11-22" });
  });
  it("excludes another project, print scope, currency, shared payment, or already-linked payment", () => {
    expect(donationMouLinkOptions(receipt, [
      payment,
      { ...payment, id: "other-project", projectId: "other" },
      { ...payment, id: "other-print", printRunId: "reprint" },
      { ...payment, id: "other-currency", currency: "EUR" },
      { ...payment, id: "shared", sharedMouGroupId: "group" },
      { ...payment, id: "paid", paidAt: new Date() },
      { ...payment, id: "linked", receiptId: "receipt" },
      { ...payment, id: "refund", amount: "-2530.00" },
    ]).map((option) => option.paymentId)).toEqual(["first"]);
  });
});
