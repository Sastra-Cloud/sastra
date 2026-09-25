import { describe, expect, it } from "vitest";

import {
  chooseEstimateQuote,
  DEFAULT_LANGUAGE_EXPANSION_FACTOR,
  estimatePrintPages,
  formatTrimSize,
  measurementInputFromInches,
  measurementInputFromMm,
  measurementInputToMm,
  measurementToInches,
} from "@/lib/print/estimate";

describe("chooseEstimateQuote", () => {
  const q = (
    reviewStatus: string,
    quantityCps: number | null,
    totalAmount: number
  ) => ({ reviewStatus, quantityCps, totalAmount });

  it("prefers an accepted quote over everything", () => {
    const quotes = [q("active", 2000, 900), q("accepted", 3000, 1200)];
    expect(chooseEstimateQuote(quotes, 2000)?.totalAmount).toBe(1200);
  });

  it("keeps the full accepted commitment when a final-balance invoice is also accepted", () => {
    const quotes = [
      { ...q("accepted", 3000, 1176), kind: "final_invoice" },
      { ...q("accepted", 3000, 2940), kind: "deposit_invoice" },
    ];
    expect(chooseEstimateQuote(quotes, 3000)?.totalAmount).toBe(2940);
  });

  it("else matches the confirmed copy count", () => {
    const quotes = [q("active", 2000, 900), q("active", 3000, 1200)];
    expect(chooseEstimateQuote(quotes, 3000)?.totalAmount).toBe(1200);
  });

  it("else falls back to the cheapest priced quote", () => {
    const quotes = [q("active", 3000, 1200), q("suggested", 2000, 900)];
    expect(chooseEstimateQuote(quotes, null)?.totalAmount).toBe(900);
  });

  it("ignores rejected quotes and returns null when none priced", () => {
    expect(
      chooseEstimateQuote([q("rejected", 2000, 900)], 2000)
    ).toBeNull();
    expect(chooseEstimateQuote([], null)).toBeNull();
  });
});

describe("estimatePrintPages", () => {
  it("uses 6 x 9 as the baseline with the Khmer expansion factor", () => {
    expect(
      estimatePrintPages({
        wordCount: 21700,
        wordsPerPage: 217,
        trimWidthIn: 6,
        trimHeightIn: 9,
      })
    ).toBe(Math.ceil((21700 * DEFAULT_LANGUAGE_EXPANSION_FACTOR) / 217));
  });

  it("ignores trim size — the Khmer edition prints at the same trim", () => {
    // Page count = source-equivalent × Khmer factor, independent of trim.
    const at69 = estimatePrintPages({
      wordCount: 21700,
      wordsPerPage: 217,
      trimWidthIn: 6,
      trimHeightIn: 9,
    });
    const at57 = estimatePrintPages({
      wordCount: 21700,
      wordsPerPage: 217,
      trimWidthIn: 5,
      trimHeightIn: 7,
    });
    expect(at57).toBe(at69);
  });

  it("estimates Khmer pages from a source page count, no trim effect", () => {
    // 162 English pages × 1.5 = 243, whatever the trim (regression for 375).
    for (const [w, h] of [
      [6, 9],
      [5, 7],
    ] as const) {
      expect(
        estimatePrintPages({
          wordCount: 21700,
          wordsPerPage: 217,
          sourcePageCount: 162,
          trimWidthIn: w,
          trimHeightIn: h,
        })
      ).toBe(243);
    }
  });

  it("guards empty inputs", () => {
    expect(estimatePrintPages({ wordCount: 0, wordsPerPage: 217 })).toBe(0);
    expect(estimatePrintPages({ wordCount: 1000, wordsPerPage: 0 })).toBe(0);
  });
});

describe("print measurement units", () => {
  it("converts project trim inputs without changing canonical inches", () => {
    expect(measurementInputFromInches("6.00", "in")).toBe("6");
    expect(measurementInputFromInches("6.00", "mm")).toBe("152.4");
    expect(measurementToInches("152.4", "mm")).toBeCloseTo(6);
  });

  it("adapts extracted millimetre quote values to the project preference", () => {
    expect(measurementInputFromMm(null, "in")).toBe("");
    expect(measurementInputFromMm("148.00", "mm")).toBe("148");
    expect(measurementInputFromMm("148.00", "in")).toBe("5.83");
    expect(measurementInputToMm("5.83", "in")).toBeCloseTo(148.082);
  });

  it("formats a trim size in the selected project unit", () => {
    expect(formatTrimSize("6.00", "9.00", "in")).toBe("6 × 9 in");
    expect(formatTrimSize("6.00", "9.00", "mm")).toBe("152.4 × 228.6 mm");
  });
});

it("prefers the accepted 2000-copy invoice over the old larger accepted quote", () => {
 const old = { kind: "quote", reviewStatus: "accepted", quantityCps: 3000, totalAmount: 1830 };
 const invoice = { kind: "invoice", reviewStatus: "accepted", quantityCps: 2000, totalAmount: 1520 };
 expect(chooseEstimateQuote([old, invoice], 3000)).toEqual(invoice);
});
