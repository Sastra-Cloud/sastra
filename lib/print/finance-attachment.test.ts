import { describe, expect, it } from "vitest";

import { looksLikePrintFinanceFile } from "./finance-attachment";

describe("looksLikePrintFinanceFile", () => {
  it("accepts obvious finance documents", () => {
    for (const name of [
      "invoice_50.pdf",
      "Discipling Quote.pdf",
      "quotation-final.pdf",
      "deposit invoice.pdf",
      "proforma.pdf",
      "Rechnung.pdf", // oddly named real invoice — no artwork signal
    ]) {
      expect(looksLikePrintFinanceFile(name)).toBe(true);
    }
  });

  it("rejects covers, bleeds, and other print artwork", () => {
    for (const name of [
      "Discipling Khmer Cover 09_Bleed.pdf",
      "Discipling jacket.pdf",
      "press-ready interior.pdf",
      "Discipling artwork.pdf",
      "Discipling proof.pdf",
      "cmyk spread.pdf",
    ]) {
      expect(looksLikePrintFinanceFile(name)).toBe(false);
    }
  });

  it("still lets a finance keyword win over an artwork word", () => {
    // A genuine invoice for cover printing should not be excluded.
    expect(looksLikePrintFinanceFile("book cover printing invoice.pdf")).toBe(true);
  });

  it("passes generically-named files to the content guard", () => {
    // No signal either way — the extractor's content check is the safety net.
    expect(looksLikePrintFinanceFile("Discipling 12.pdf")).toBe(true);
    expect(looksLikePrintFinanceFile(null)).toBe(true);
  });
});
