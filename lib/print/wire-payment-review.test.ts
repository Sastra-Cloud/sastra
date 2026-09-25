import { expect, it } from "vitest";
import { reviewWirePayment } from "./wire-payment-review";
const quote = { id: "old", kind: "quote", reviewStatus: "accepted", totalAmount: "1830.00", currency: "USD" };
const invoice = { ...quote, id: "invoice", kind: "invoice", totalAmount: "1520.00" };
const full = { id: "full", kind: "full", amount: "1830.00", currency: "USD", quoteId: "old", status: "planned", paidAt: null, wireRequestedAt: null };
const deposit = { ...full, id: "deposit", kind: "deposit", amount: "912.00", quoteId: "invoice" };
const final = { ...deposit, id: "final", kind: "final", amount: "608.00" };
it("reviews the obsolete 3000-copy full payment against the 2000-copy accepted invoice", () => {
 expect(reviewWirePayment(full, [full, deposit, final], [quote, invoice]).correction).toEqual({ invoiceId: "invoice", amount: "1520.00", currency: "USD", replacedPayments: 2 });
});
it("keeps the corrected single full payment ready", () => {
 const corrected = { ...full, amount: "1520.00", quoteId: "invoice" };
 expect(reviewWirePayment(corrected, [corrected], [quote, invoice])).toEqual({});
});
it("still consolidates duplicate stages when the full amount already matches", () => {
 const corrected = { ...full, amount: "1520.00" };
 expect(reviewWirePayment(corrected, [corrected, deposit, final], [invoice]).correction?.replacedPayments).toBe(2);
});
for (const protectedPayment of [{ ...deposit, paidAt: new Date() }, { ...deposit, wireRequestedAt: new Date() }, { ...deposit, quoteId: null }, { ...deposit, status: "requested" }]) {
 it("does not rewrite paid, requested, or manual schedules", () => {
  const result = reviewWirePayment(full, [full, protectedPayment], [invoice]);
  expect(result.error).toBeTruthy(); expect(result.correction).toBeUndefined();
 });
}
it("does not guess between multiple accepted invoices", () => {
 const result = reviewWirePayment(full, [full], [invoice, { ...invoice, id: "other" }]);
 expect(result.error).toContain("Several"); expect(result.correction).toBeUndefined();
});
it("does not use unaccepted invoices", () => {
 expect(reviewWirePayment(full, [full], [{ ...invoice, reviewStatus: "suggested" }])).toEqual({});
});
