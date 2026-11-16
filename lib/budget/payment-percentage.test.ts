import { describe, expect, it } from "vitest";
import { percentageAmountCents, suggestPercentagePayments } from "./payment-percentage";

const payments = [
  { id: "signing", amount: "0.00", currency: "USD", notes: "50% of the Total Payment to Licensee (US$21,670.56) due on contract signature" },
  { id: "fee", amount: "675.00", currency: "USD", notes: "Administration Fee to the Licensor, US$675.00 (UK£500.00)" },
  { id: "final", amount: "0.00", currency: "USD", notes: "Remaining 50% of the Total Payment to Licensee due upon completion and receipt of final production files" },
];

describe("percentage expected payments", () => {
  it("calculates both installments from the stated total, without dividing by the separate fee or current quotation", () => {
    const result = suggestPercentagePayments(payments, { total: 30_000, currency: "USD" });
    expect([...result.keys()]).toEqual(["signing", "final"]);
    expect(result.get("final")).toEqual({ percentage: 50, totalCents: 2_167_056, amountCents: 1_083_528, source: "payment_terms" });
    expect(result.get("signing")?.amountCents).toBe(1_083_528);
  });

  it("uses unequal percentages and keeps the odd cent on the final missing installment", () => {
    const result = suggestPercentagePayments([
      { id: "first", amount: null, currency: "EUR", notes: "30% of the total payment" },
      { id: "last", amount: null, currency: "EUR", notes: "Remaining 70% of the total payment" },
    ], { total: 100.05, currency: "EUR" });
    expect([...result.values()].map((row) => row.amountCents)).toEqual([3002, 7003]);
    const savedFirst = suggestPercentagePayments([
      { id: "first", amount: "6094.69", currency: "USD", notes: "50% of the total payment" },
      { id: "last", amount: null, currency: "USD", notes: "Remaining 50% of the total payment" },
    ], { total: 12189.37, currency: "USD" });
    expect([...savedFirst.keys()]).toEqual(["last"]);
    expect(savedFirst.get("last")?.amountCents).toBe(609468);
  });

  it("requires an unambiguous total and currency and preserves saved amounts", () => {
    expect(suggestPercentagePayments([
      payments[0], { ...payments[2], notes: "50% of the Total Payment to Licensee (US$22,000.00)" },
    ], { total: 21670.56, currency: "USD" }).size).toBe(0);
    const withoutStatedTotal = [{ ...payments[2], currency: "EUR" }];
    expect(suggestPercentagePayments(withoutStatedTotal, { total: 21670.56, currency: "USD" }).size).toBe(0);
    expect(suggestPercentagePayments(payments.map((row) => ({ ...row, amount: "100.00" }))).size).toBe(0);
    expect(percentageAmountCents(100, 150)).toBeNull();
    expect(percentageAmountCents(0, 50)).toBeNull();
  });
});
