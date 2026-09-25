import { describe, expect, it } from "vitest";

import {
  acceptedPrintCommitmentTotal,
  buildPrintQuoteComparisonGroups,
  getPrintQuoteTotal,
  type PrintQuoteEconomicsInput,
} from "@/lib/print/quote-economics";

function quote(
  overrides: Partial<PrintQuoteEconomicsInput> &
    Pick<PrintQuoteEconomicsInput, "id" | "quantityCps">,
): PrintQuoteEconomicsInput {
  return {
    reviewStatus: "suggested",
    unitPrice: null,
    totalAmount: null,
    currency: "USD",
    ...overrides,
  };
}

describe("getPrintQuoteTotal", () => {
  it("uses the quoted total when one is available", () => {
    expect(
      getPrintQuoteTotal({
        quantityCps: 2_000,
        unitPrice: "0.81",
        totalAmount: "1650",
      }),
    ).toEqual({ totalCost: 1650, calculated: false });
  });

  it("calculates the total from quantity and unit price when needed", () => {
    expect(
      getPrintQuoteTotal({
        quantityCps: 3_000,
        unitPrice: "0.66",
        totalAmount: null,
      }),
    ).toEqual({ totalCost: 1980, calculated: true });
  });

  it("returns null when the quote cannot be priced", () => {
    expect(
      getPrintQuoteTotal({
        quantityCps: 3_000,
        unitPrice: null,
        totalAmount: null,
      }),
    ).toBeNull();
  });
});

describe("acceptedPrintCommitmentTotal", () => {
  it("does not double-count deposit and final documents for one run", () => {
    expect(
      acceptedPrintCommitmentTotal([
        {
          ...quote({
            id: "deposit",
            quantityCps: 3_000,
            totalAmount: "2940.00",
            reviewStatus: "accepted",
          }),
          runId: "run-one",
        },
        {
          ...quote({
            id: "final",
            quantityCps: 3_000,
            totalAmount: "1176.00",
            reviewStatus: "accepted",
          }),
          runId: "run-one",
        },
        {
          ...quote({
            id: "second-run",
            quantityCps: 1_000,
            totalAmount: "800.00",
            reviewStatus: "accepted",
          }),
          runId: "run-two",
        },
      ])
    ).toBe(3740);
  });
});

describe("buildPrintQuoteComparisonGroups", () => {
  it("calculates the step-up economics for the example print tiers", () => {
    const [comparison] = buildPrintQuoteComparisonGroups([
      quote({ id: "two", quantityCps: 2_000, unitPrice: "0.81" }),
      quote({ id: "three", quantityCps: 3_000, unitPrice: "0.66" }),
    ]);

    expect(comparison.bestUnitQuoteId).toBe("three");
    expect(comparison.recommendedQuoteId).toBe("three");
    expect(comparison.lowestOutlayQuoteId).toBe("two");
    expect(comparison.bestStep).toMatchObject({
      extraCopies: 1_000,
      extraSpend: 360,
      incrementalUnitCost: 0.36,
      valueThresholdQuantity: 2_445,
    });
    expect(comparison.bestStep?.incrementalSavingsPercent).toBeCloseTo(
      55.56,
      1,
    );
    expect(comparison.bestStep?.valueThresholdPercent).toBeCloseTo(81.5, 1);
  });

  it("does not compare different currencies", () => {
    const comparisons = buildPrintQuoteComparisonGroups([
      quote({ id: "usd", quantityCps: 2_000, totalAmount: 1_600 }),
      quote({
        id: "eur",
        quantityCps: 3_000,
        totalAmount: 1_900,
        currency: "EUR",
      }),
    ]);

    expect(comparisons).toEqual([]);
  });

  it("ignores rejected quotes and prefers accepted duplicate tiers", () => {
    const [comparison] = buildPrintQuoteComparisonGroups([
      quote({ id: "rejected", quantityCps: 1_000, totalAmount: 700, reviewStatus: "rejected" }),
      quote({ id: "suggested", quantityCps: 2_000, totalAmount: 1_500 }),
      quote({ id: "accepted", quantityCps: 2_000, totalAmount: 1_620, reviewStatus: "accepted" }),
      quote({ id: "three", quantityCps: 3_000, totalAmount: 1_980 }),
    ]);

    expect(comparison.tiers.map((tier) => tier.quoteId)).toEqual([
      "accepted",
      "three",
    ]);
  });

  it("does not recommend a step-up when the extra copies cost more per copy", () => {
    const [comparison] = buildPrintQuoteComparisonGroups([
      quote({ id: "two", quantityCps: 2_000, totalAmount: 1_000 }),
      quote({ id: "three", quantityCps: 3_000, totalAmount: 1_800 }),
    ]);

    expect(comparison.bestStep).toBeNull();
    expect(comparison.recommendedQuoteId).toBeNull();
  });

  it("recommends the economic elbow instead of the lowest average unit cost", () => {
    const [comparison] = buildPrintQuoteComparisonGroups([
      quote({ id: "one", quantityCps: 1_000, totalAmount: 1_760 }),
      quote({ id: "two", quantityCps: 2_000, totalAmount: 2_640 }),
      quote({ id: "three", quantityCps: 3_000, totalAmount: 2_940 }),
      quote({ id: "four", quantityCps: 4_000, totalAmount: 3_760 }),
      quote({ id: "five", quantityCps: 5_000, totalAmount: 4_450 }),
    ]);

    expect(comparison.recommendedQuoteId).toBe("three");
    expect(comparison.bestUnitQuoteId).toBe("five");
    expect(comparison.bestStep).toMatchObject({
      extraCopies: 1_000,
      extraSpend: 300,
      incrementalUnitCost: 0.3,
      valueThresholdQuantity: 2_228,
    });
    expect(comparison.bestStep?.valueThresholdPercent).toBeCloseTo(74.27, 1);
  });
});
