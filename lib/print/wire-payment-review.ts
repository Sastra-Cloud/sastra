type Invoice = { id: string; kind: string; reviewStatus: string; totalAmount: string | null; currency: string };
type Payment = { id: string; kind: string; amount: string; currency: string; quoteId: string | null; status: string; paidAt: Date | null; wireRequestedAt: Date | null };

/** An accepted order invoice, rather than an alternative quote, governs wiring. */
export function reviewWirePayment(payment: Payment, payments: Payment[], quotes: Invoice[]) {
  const invoices = quotes.filter(q => q.reviewStatus === "accepted" && ["invoice", "deposit_invoice"].includes(q.kind));
  if (invoices.length !== 1) return invoices.length > 1
    ? { error: "Several order invoices are accepted. Review which invoice governs this payment before requesting a wire." }
    : {};
  const invoice = invoices[0];
  if (payment.kind !== "full") return {};
  const siblings = payments.filter(p => p.id !== payment.id);
  const mismatch = payment.currency !== invoice.currency || Number(payment.amount) !== Number(invoice.totalAmount);
  if (!mismatch && !siblings.length) return {};
  if (!(Number(invoice.totalAmount) > 0) || payments.some(p => p.paidAt || p.wireRequestedAt || p.status !== "planned" || !p.quoteId)) {
    return { error: "This full payment conflicts with the accepted invoice or other payments. Review the schedule; payments already requested, paid, or entered manually cannot be consolidated automatically." };
  }
  return { error: "The full-payment schedule needs review against the accepted invoice.", correction: {
    invoiceId: invoice.id, amount: Number(invoice.totalAmount).toFixed(2), currency: invoice.currency, replacedPayments: siblings.length,
  } };
}
