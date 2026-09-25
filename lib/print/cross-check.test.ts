import { describe, expect, it } from "vitest";

import { crossCheckQuotes, currencyStatedIn, selfCheckFlags } from "./cross-check";
import type { ParsedPrinterQuote } from "./parser";

function quote(overrides: Partial<ParsedPrinterQuote> = {}): ParsedPrinterQuote {
  return {
    kind: "quote",
    invoiceNumber: null,
    issueDate: null,
    title: null,
    quantityCps: null,
    unitPrice: null,
    totalAmount: null,
    depositAmount: null,
    balanceAmount: null,
    currency: "USD",
    trimWidthMm: null,
    trimHeightMm: null,
    textPages: null,
    coverPages: null,
    textSpec: null,
    coverSpec: null,
    binding: null,
    deliveryLocation: null,
    paymentTerms: null,
    latestProofUrl: null,
    ...overrides,
  };
}

describe("selfCheckFlags", () => {
  it("flags a total that doesn't match quantity × unit price", () => {
    const flags = selfCheckFlags(
      quote({ quantityCps: 1000, unitPrice: "1.760", totalAmount: "2000.00" })
    );
    expect(flags.map((f) => f.kind)).toContain("computed_total_mismatch");
  });

  it("does not flag a consistent total", () => {
    const flags = selfCheckFlags(
      quote({ quantityCps: 1000, unitPrice: "1.760", totalAmount: "1760.00" })
    );
    expect(flags).toHaveLength(0);
  });

  it("flags a staged payment split that does not add up to the total", () => {
    const flags = selfCheckFlags(
      quote({
        totalAmount: "1780.00",
        depositAmount: "1068.00",
        balanceAmount: "700.00",
      })
    );
    expect(flags.map((flag) => flag.kind)).toContain("payment_split_mismatch");
  });

  it("flags an assumed currency when none was stated", () => {
    const flags = selfCheckFlags(quote({ currency: "USD" }), {
      currencyStated: false,
    });
    expect(flags.map((f) => f.kind)).toContain("currency_defaulted");
  });

  it("does not flag currency when the source stated one", () => {
    const flags = selfCheckFlags(quote({ currency: "USD" }), {
      currencyStated: true,
    });
    expect(flags.map((f) => f.kind)).not.toContain("currency_defaulted");
  });

  it("flags an ambiguous source date", () => {
    const flags = selfCheckFlags(quote({ issueDate: "2026-05-07" }), {
      rawIssueDate: "07/05/2026",
    });
    expect(flags.map((f) => f.kind)).toContain("ambiguous_date");
  });
});

describe("crossCheckQuotes", () => {
  it("flags fields where AI and the regex parser disagree, matched by quantity", () => {
    const ai = [quote({ quantityCps: 1000, unitPrice: "1.760", totalAmount: "1760.00" })];
    const regex = [quote({ quantityCps: 1000, unitPrice: "1.800", totalAmount: "1800.00" })];
    const [flags] = crossCheckQuotes(ai, regex);
    const fields = flags.map((f) => f.field);
    expect(fields).toContain("unitPrice");
    expect(fields).toContain("totalAmount");
    expect(flags.every((f) => f.kind === "regex_disagrees")).toBe(true);
  });

  it("matches tiers by quantity across a multi-tier list", () => {
    const ai = [
      quote({ quantityCps: 1000, unitPrice: "1.760" }),
      quote({ quantityCps: 2000, unitPrice: "1.420" }),
    ];
    const regex = [
      quote({ quantityCps: 2000, unitPrice: "9.990" }), // disagrees
      quote({ quantityCps: 1000, unitPrice: "1.760" }), // agrees
    ];
    const result = crossCheckQuotes(ai, regex);
    expect(result[0]).toHaveLength(0); // 1000 tier agrees
    expect(result[1].map((f) => f.field)).toContain("unitPrice"); // 2000 tier disagrees
  });

  it("flags a balance where the AI and pattern parser disagree", () => {
    const ai = [quote({ quantityCps: 1000, balanceAmount: "700.00" })];
    const regex = [quote({ quantityCps: 1000, balanceAmount: "712.00" })];
    const [flags] = crossCheckQuotes(ai, regex);
    expect(flags.map((flag) => flag.field)).toContain("balanceAmount");
  });

  it("emits no flags when there's no regex counterpart", () => {
    const ai = [quote({ quantityCps: 1000, unitPrice: "1.760" })];
    expect(crossCheckQuotes(ai, [])).toEqual([[]]);
  });
});

describe("currencyStatedIn", () => {
  it("detects currency tokens and symbols", () => {
    expect(currencyStatedIn("1000 cps @ USD 1.76")).toBe(true);
    expect(currencyStatedIn("Total: $1,760.00")).toBe(true);
    expect(currencyStatedIn("Price per copy 1.76")).toBe(false);
    expect(currencyStatedIn(null)).toBe(false);
  });
});
