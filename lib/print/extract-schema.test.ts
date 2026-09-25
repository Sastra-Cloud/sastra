import { describe, expect, it } from "vitest";

import { normalizePrintQuoteExtract } from "./extract-schema";

const valid = {
  kind: "final_invoice",
  invoiceNumber: "26050601R1",
  issueDate: "2026-05-26",
  title: "50 Crucial Questions",
  quantityCps: 3000,
  unitPrice: 1.42,
  totalAmount: 4260,
  depositAmount: 2556,
  balanceAmount: 1704,
  currency: "USD",
  trimWidthMm: 140,
  trimHeightMm: 210,
  textPages: 160,
  coverPages: 4,
  textSpec: "80gsm woodfree",
  coverSpec: "250gsm art card",
  binding: "Perfect bound",
  deliveryLocation: "Foshan",
  paymentTerms: "60% deposit, 40% balance",
};

describe("normalizePrintQuoteExtract", () => {
  it("normalizes a well-formed extraction into the parser shape", () => {
    const out = normalizePrintQuoteExtract(valid);
    expect(out.kind).toBe("final_invoice");
    expect(out.quantityCps).toBe(3000);
    expect(out.unitPrice).toBe("1.420");
    expect(out.totalAmount).toBe("4260.00");
    expect(out.issueDate).toBe("2026-05-26");
    expect(out.currency).toBe("USD");
    expect(out.trimWidthMm).toBe("140.00");
  });

  it("tolerates numeric-string values from the model", () => {
    const out = normalizePrintQuoteExtract({
      ...valid,
      quantityCps: "3000",
      unitPrice: "1.42",
    });
    expect(out.quantityCps).toBe(3000);
    expect(out.unitPrice).toBe("1.420");
  });

  it("maps empty strings and nulls to nulls", () => {
    const out = normalizePrintQuoteExtract({
      ...valid,
      invoiceNumber: "",
      totalAmount: null,
    });
    expect(out.invoiceNumber).toBe(null);
    expect(out.totalAmount).toBe(null);
  });

  it("falls back to 'quote' for an unknown kind", () => {
    const out = normalizePrintQuoteExtract({ ...valid, kind: "purchase_order" });
    expect(out.kind).toBe("quote");
  });

  it("derives a missing staged balance and respects a deposit-invoice filename", () => {
    const out = normalizePrintQuoteExtract(
      {
        ...valid,
        kind: "invoice",
        totalAmount: 1780,
        depositAmount: 1068,
        balanceAmount: null,
        paymentTerms:
          "60% deposit (USD 1068) and 40% balance on approved completion",
      },
      {
        sourceFileName:
          "Deposit INVOICE - The Worship Ministry Guidebook 26081401R1.pdf",
      }
    );

    expect(out.kind).toBe("deposit_invoice");
    expect(out.depositAmount).toBe("1068.00");
    expect(out.balanceAmount).toBe("712.00");
  });

  it("corrects an AI balance that repeats the invoice grand total", () => {
    const out = normalizePrintQuoteExtract({
      ...valid,
      totalAmount: 1780,
      depositAmount: 1068,
      balanceAmount: 1780,
    });
    expect(out.balanceAmount).toBe("712.00");
  });

  it("throws on fundamentally malformed output (array)", () => {
    expect(() => normalizePrintQuoteExtract([1, 2, 3])).toThrow(/malformed/i);
  });

  it("throws when a field has a wholly unexpected type", () => {
    expect(() =>
      normalizePrintQuoteExtract({ ...valid, quantityCps: { nested: true } })
    ).toThrow(/malformed/i);
  });
});
