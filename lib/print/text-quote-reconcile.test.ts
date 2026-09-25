import { describe, expect, it } from "vitest";

import type { ParsedPrinterQuote } from "./parser";
import { reconcileTextQuotes } from "./text-quote-reconcile";

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

// The Discipling email's tiers, as the regex parser reads them (including the
// smushed "0.61per cpy").
const regexTiers: ParsedPrinterQuote[] = [
  quote({ quantityCps: 2000, unitPrice: "0.760", totalAmount: "1520.00" }),
  quote({ quantityCps: 3000, unitPrice: "0.610", totalAmount: "1830.00" }),
  quote({ quantityCps: 4000, unitPrice: "0.550", totalAmount: "2200.00" }),
  quote({ quantityCps: 5000, unitPrice: "0.500", totalAmount: "2500.00" }),
];

describe("reconcileTextQuotes", () => {
  it("re-adds a tier the AI omitted entirely (the smushed 3,000 tier)", () => {
    // The model returned only the cleanly-formatted tiers, dropping 3,000.
    const aiTiers = [
      quote({ quantityCps: 2000, unitPrice: "0.76", totalAmount: "1520.00" }),
      quote({ quantityCps: 4000, unitPrice: "0.55", totalAmount: "2200.00" }),
      quote({ quantityCps: 5000, unitPrice: "0.50", totalAmount: "2500.00" }),
    ];

    const result = reconcileTextQuotes(aiTiers, regexTiers, {
      currencyStated: true,
    });

    const tier3000 = result.find((r) => r.quote.quantityCps === 3000);
    expect(tier3000).toBeDefined();
    expect(tier3000?.quote.unitPrice).toBe("0.610");
    expect(tier3000?.quote.totalAmount).toBe("1830.00");
    expect(tier3000?.source).toBe("regex_fallback");
    expect(tier3000?.flags.some((f) => f.kind === "regex_recovered")).toBe(true);
    // Every quantity survives.
    expect(result.map((r) => r.quote.quantityCps).sort()).toEqual([
      2000, 3000, 4000, 5000,
    ]);
  });

  it("backfills a price the AI returned as null on a tier it did keep", () => {
    const aiTiers = [
      quote({ quantityCps: 2000, unitPrice: "0.76", totalAmount: "1520.00" }),
      // Kept the 3,000 tier but couldn't read the smushed price.
      quote({ quantityCps: 3000, unitPrice: null, totalAmount: null }),
    ];

    const result = reconcileTextQuotes(aiTiers, regexTiers, {
      currencyStated: true,
    });

    const tier3000 = result.find((r) => r.quote.quantityCps === 3000);
    expect(tier3000?.quote.unitPrice).toBe("0.610");
    expect(tier3000?.quote.totalAmount).toBe("1830.00");
    expect(tier3000?.source).toBe("ai");
    expect(
      tier3000?.flags.some(
        (f) => f.kind === "regex_recovered" && f.field === "unitPrice"
      )
    ).toBe(true);
    // No duplicate 3,000 tier gets appended.
    expect(result.filter((r) => r.quote.quantityCps === 3000)).toHaveLength(1);
  });

  it("leaves fully-read AI tiers untouched", () => {
    const aiTiers = regexTiers.map((r) => quote({ ...r }));
    const result = reconcileTextQuotes(aiTiers, regexTiers, {
      currencyStated: true,
    });
    expect(result).toHaveLength(4);
    expect(result.every((r) => r.source === "ai")).toBe(true);
  });

  it("backfills production specs that the AI omitted", () => {
    const regex = [
      quote({
        quantityCps: 25_000,
        unitPrice: "0.570",
        totalAmount: "14250.00",
        title: "Hope Out Loud",
        trimWidthMm: "148.00",
        trimHeightMm: "210.00",
        textPages: 208,
        textSpec: "Woodfree 80g",
        coverSpec: "Glossy 260g C1S",
        binding: "Smyth sewn, paper back",
        deliveryLocation: "Foshan Warehouse",
      }),
    ];
    const ai = [
      quote({
        quantityCps: 25_000,
        unitPrice: "0.570",
        totalAmount: "14250.00",
      }),
    ];

    const [result] = reconcileTextQuotes(ai, regex, {
      currencyStated: true,
    });

    expect(result.quote).toMatchObject({
      title: "Hope Out Loud",
      trimWidthMm: "148.00",
      trimHeightMm: "210.00",
      textPages: 208,
      textSpec: "Woodfree 80g",
      coverSpec: "Glossy 260g C1S",
      binding: "Smyth sewn, paper back",
      deliveryLocation: "Foshan Warehouse",
    });
    expect(
      result.flags.some(
        (flag) => flag.field === "_specs" && flag.kind === "regex_recovered"
      )
    ).toBe(true);
  });
});
