import { describe, expect, it } from "vitest";

import {
  STANDARD_LINES,
  DEFAULT_LANGUAGE_EXPANSION_FACTOR,
  budgetGroupLabel,
  committedFundingTotal,
  lineAmount,
  lineAmountCents,
  lineQuantity,
  rateForCategory,
  sumAmountCents,
  type BudgetRates,
} from "@/lib/budget/compute";

const DEFAULT_RATES: BudgetRates = {
  rateTranslation: "0.03",
  rateProofreading: "0.01",
  rateEditing: "0.03",
  rateCoverDesign: "100",
  rateTypesetting: "3",
  rateProjectManagement: "200",
  ratePrintShip: "2000",
  rateAudiobook: "0.01",
  rateVideoSeries: "0.01",
};

describe("lineAmount (integer-cents, no float drift)", () => {
  it("multiplies quantity × unit price to 2dp", () => {
    expect(lineAmount(5613, "0.03")).toBe("168.39");
    expect(lineAmount(5613, "0.01")).toBe("56.13");
    expect(lineAmount(1, "100")).toBe("100.00");
    expect(lineAmount(26, "3")).toBe("78.00");
    expect(lineAmount(1, "2000")).toBe("2000.00");
  });

  it("rounds half-up at the cent", () => {
    expect(lineAmountCents(1, "0.005")).toBe(1); // 0.5c → 1c
    expect(lineAmount(3, "0.333")).toBe("1.00"); // 0.999 → 1.00
  });

  it("treats invalid input as zero", () => {
    expect(lineAmount("", "")).toBe("0.00");
    expect(lineAmount(null, undefined)).toBe("0.00");
  });
});

describe("budgetGroupLabel", () => {
  it("uses the project format instead of calling every primary group a book", () => {
    expect(budgetGroupLabel("book_publishing", "book")).toBe("Book Publishing");
    expect(budgetGroupLabel("book_publishing", "article")).toBe(
      "Article Publishing"
    );
    expect(budgetGroupLabel("book_publishing", "other")).toBe("Project Costs");
    expect(budgetGroupLabel("additional_media", "video_series")).toBe(
      "Video Production"
    );
    expect(budgetGroupLabel("additional_media", "podcast")).toBe(
      "Podcast Production"
    );
  });
});

describe("lineQuantity", () => {
  const basis = { wordCount: 5613, wordsPerPage: 217 };
  it("word-driven → word count", () => {
    expect(lineQuantity("words", basis)).toBe(5613);
  });
  it("pages → estimated Khmer pages from words when no source page count exists", () => {
    expect(lineQuantity("pages", basis)).toBe(39);
    expect(lineQuantity("pages", { ...basis, languageExpansionFactor: 1 })).toBe(26);
  });
  it("pages → English source pages × Khmer expansion when source pages exist", () => {
    expect(
      lineQuantity("pages", {
        ...basis,
        sourcePageCount: 144,
        languageExpansionFactor: DEFAULT_LANGUAGE_EXPANSION_FACTOR,
      })
    ).toBe(216);
  });
  it("flat units → 1", () => {
    expect(lineQuantity("cover", basis)).toBe(1);
    expect(lineQuantity("project", basis)).toBe(1);
    expect(lineQuantity("flat", basis)).toBe(1);
  });
  it("guards divide-by-zero", () => {
    expect(lineQuantity("pages", { wordCount: 5613, wordsPerPage: 0 })).toBe(0);
  });
});

describe("standard quotation fixture", () => {
  it("8 default lines at 5613 words total $922.17 (no seeded Print / Ship)", () => {
    const basis = { wordCount: 5613, wordsPerPage: 217 };
    let cents = 0;
    for (const line of STANDARD_LINES) {
      const qty = lineQuantity(line.unit, basis);
      const price = rateForCategory(line.category, DEFAULT_RATES);
      cents += lineAmountCents(qty, price);
    }
    // Print / Ship is no longer seeded ($2,000 flat removed) — the print cost is
    // driven by the printer quote for a chosen copy count instead.
    expect(STANDARD_LINES).toHaveLength(8);
    expect(STANDARD_LINES.some((l) => l.category === "print_ship")).toBe(false);
    expect((cents / 100).toFixed(2)).toBe("922.17");
  });
});

describe("sumAmountCents", () => {
  it("sums stored amount strings into whole cents", () => {
    expect(sumAmountCents([{ amount: "168.39" }, { amount: "56.13" }])).toBe(
      22452
    );
  });
});

describe("committedFundingTotal", () => {
  it("shows a signed agreement schedule as committed funding", () => {
    expect(committedFundingTotal(0, 10088)).toBe(10088);
  });

  it("does not double-count line-level Raised and its payment schedule", () => {
    expect(committedFundingTotal(10088, 10088)).toBe(10088);
  });

  it("adds unrelated received contributions", () => {
    expect(committedFundingTotal(10088, 10088, 500)).toBe(10588);
  });
});
