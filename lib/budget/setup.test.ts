import { expect, it } from "vitest";

import {
  budgetSetupRows,
  budgetSetupTotalCents,
  setupCostsWaitingForSize,
  setupStandardCosts,
} from "./setup";

const rates = {
  rateTranslation: "0.0500",
  rateProofreading: "0.0100",
  rateEditing: "0.0200",
  rateCoverDesign: "300.0000",
  rateTypesetting: "2.5000",
  rateProjectManagement: "500.0000",
  ratePrintShip: "0.0000",
  rateAudiobook: "0.0300",
  rateVideoSeries: "0.0400",
};
const basis = { wordsPerPage: 250, languageExpansionFactor: "1.5" };

it("offers publishing costs by default and leaves audio and video unchecked", () => {
  const costs = setupStandardCosts(rates);
  expect(costs.filter((cost) => cost.included).map((cost) => cost.category)).toEqual([
    "translation",
    "proofreading",
    "editing",
    "cover_design",
    "typesetting",
    "project_management",
  ]);
  expect(costs.some((cost) => cost.category === "print_ship")).toBe(false);
});

it("stores the same amounts the guided preview showed", () => {
  const lines = setupStandardCosts(rates)
    .filter((cost) => cost.included)
    .map(({ category, label, unit, quantity, unitPrice, autoQuantity }) => ({
      category,
      label,
      unit,
      quantity,
      unitPrice,
      autoQuantity,
    }));
  const rows = budgetSetupRows(
    { wordCount: 40_000, sourcePageCount: 0, lines },
    basis,
    "USD"
  );
  // 40,000 words at 250 words a page, expanded 1.5 times = 240 pages.
  expect(rows.map((row) => [row.category, row.quantity, row.amount])).toEqual([
    ["translation", "40000.00", "2000.00"],
    ["proofreading", "40000.00", "400.00"],
    ["editing", "40000.00", "800.00"],
    ["cover_design", "1.00", "300.00"],
    ["typesetting", "240.00", "600.00"],
    ["project_management", "1.00", "500.00"],
  ]);
  expect(budgetSetupTotalCents(rows)).toBe(460_000);
  expect(rows.every((row) => row.isAutoQuantity && row.currency === "USD")).toBe(true);
});

it("keeps a typed quantity and counts costs that wait for the book size", () => {
  const lines = [
    { category: "translation" as const, label: "Translation", unit: "words" as const, quantity: 0, unitPrice: 0.05, autoQuantity: true },
    { category: "custom" as const, label: "Freight", unit: "flat" as const, quantity: 2, unitPrice: 150, autoQuantity: false },
  ];
  const unknown = { wordCount: 0, sourcePageCount: 0, lines };
  expect(setupCostsWaitingForSize(unknown)).toBe(1);
  expect(setupCostsWaitingForSize({ ...unknown, sourcePageCount: 120 })).toBe(0);
  const rows = budgetSetupRows(unknown, basis, "USD");
  expect(rows.map((row) => row.amount)).toEqual(["0.00", "300.00"]);
  expect(rows[1].group).toBe("book_publishing");
});
