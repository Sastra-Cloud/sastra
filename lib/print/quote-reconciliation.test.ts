import { describe, expect, it } from "vitest";

import type { ParsedPrinterQuote } from "@/lib/print/parser";
import {
  acceptedQuotePaymentPlan,
  invoiceFilePaymentKinds,
  isPendingPrintInvoiceReview,
  quoteHasMeaningfulChanges,
  quoteIdentityKind,
  quoteRevisionKey,
} from "@/lib/print/quote-reconciliation";

const quote = (
  overrides: Partial<ParsedPrinterQuote> = {}
): ParsedPrinterQuote => ({
  kind: "quote",
  invoiceNumber: null,
  issueDate: null,
  title: "Fundamentals of the Faith",
  quantityCps: 3_000,
  unitPrice: "0.980",
  totalAmount: "2940.00",
  depositAmount: null,
  balanceAmount: null,
  currency: "USD",
  trimWidthMm: null,
  trimHeightMm: null,
  textPages: 120,
  coverPages: 4,
  textSpec: null,
  coverSpec: null,
  binding: null,
  deliveryLocation: null,
  paymentTerms: null,
  latestProofUrl: null,
  ...overrides,
});

describe("quote reconciliation", () => {
  it("treats a repeated tier as unchanged despite numeric formatting", () => {
    expect(
      quoteHasMeaningfulChanges(quote(), quote({ unitPrice: "0.98" }))
    ).toBe(false);
  });

  it("allows a short follow-up to omit old specs without erasing them", () => {
    expect(
      quoteHasMeaningfulChanges(
        quote({ binding: "Smyth sewn", paymentTerms: "60% deposit" }),
        quote({ binding: null, paymentTerms: null })
      )
    ).toBe(false);
  });

  it("detects revised pricing for an accepted tier", () => {
    expect(
      quoteHasMeaningfulChanges(quote(), quote({ totalAmount: "3010.00" }))
    ).toBe(true);
  });

  it("keys tiers by document kind and quantity", () => {
    expect(quoteRevisionKey(quote())).toBe("quote_or_invoice:qty:3000");
    expect(quoteRevisionKey(quote({ kind: "deposit_invoice" }))).toBe(
      "deposit_invoice:qty:3000"
    );
  });

  it("treats generic quote and invoice labels as one tier family", () => {
    expect(quoteIdentityKind("quote")).toBe("quote_or_invoice");
    expect(quoteIdentityKind("invoice")).toBe("quote_or_invoice");
    expect(
      quoteHasMeaningfulChanges(quote(), quote({ kind: "invoice" }))
    ).toBe(false);
  });

  it("routes invoice files to the matching generated payments", () => {
    expect(invoiceFilePaymentKinds("deposit_invoice")).toEqual([
      "deposit",
      "final",
    ]);
    expect(invoiceFilePaymentKinds("final_invoice")).toEqual(["final", "full"]);
    expect(invoiceFilePaymentKinds("quote")).toEqual([]);
  });

  it("keeps a staged deposit invoice as support for the full payment schedule", () => {
    expect(
      acceptedQuotePaymentPlan(
        quote({
          kind: "deposit_invoice",
          totalAmount: "2940.00",
          depositAmount: "1764.00",
          balanceAmount: "1176.00",
        })
      )
    ).toEqual([
      { kind: "deposit", amount: "1764.00" },
      { kind: "final", amount: "1176.00" },
    ]);
  });

  it("never recreates the deposit from a final invoice", () => {
    expect(
      acceptedQuotePaymentPlan(
        quote({
          kind: "final_invoice",
          totalAmount: "2940.00",
          depositAmount: "1764.00",
          balanceAmount: "1176.00",
        })
      )
    ).toEqual([{ kind: "final", amount: "1176.00" }]);
  });

  it("keeps new invoice reviews visible when old quote alternatives collapse", () => {
    expect(
      isPendingPrintInvoiceReview({
        kind: "final_invoice",
        reviewStatus: "suggested",
      })
    ).toBe(true);
    expect(
      isPendingPrintInvoiceReview({
        kind: "quote",
        reviewStatus: "suggested",
      })
    ).toBe(false);
    expect(
      isPendingPrintInvoiceReview({
        kind: "final_invoice",
        reviewStatus: "rejected",
      })
    ).toBe(false);
  });
});
