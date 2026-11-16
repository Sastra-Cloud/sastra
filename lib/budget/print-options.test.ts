import { expect, it } from "vitest";
import { addPartnerPrintOptions, fundPartnerPrintOptions, fundPartnerPrintOptionsForRates, partnerBaseItems, partnerQuotePrices, reviewPartnerPrintOptions, type PartnerPrintOption } from "./print-options";
import { expectedNetCents, grossTargetCents, partnerQuoteTotalCents, suggestPartnerRates } from "./compute";
import { applyPartnerRates } from "./partner-line-state";

const option: PartnerPrintOption = { sourceQuoteId: "00000000-0000-4000-8000-000000000001", quantity: 1000, printingCostCents: 156000, partnerAmountCents: 180000, label: "Printing", currency: "USD" };
const candidate = { ...option, printer: "Printer", specifications: "164 pages", sourceThreadId: null };
const items = [
  { id: "translation", category: "translation", label: "Translation", quantity: "10000", unit: "words" as const, unitPrice: "0.03", partnerUnitPrice: "0.04", partnerLabel: null, partnerVisible: true, amount: "300" },
  { id: "hidden", category: "custom", label: "Internal", quantity: "1", unit: "flat" as const, unitPrice: "100", partnerUnitPrice: null, partnerLabel: null, partnerVisible: false, amount: "100" },
  { id: "printing", category: "print_ship", label: "Selected print estimate", quantity: "1", unit: "flat" as const, unitPrice: "2670", partnerUnitPrice: null, partnerLabel: null, partnerVisible: true, amount: "2670" },
];

// Bulk inclusion must preserve edits and fund every quantity after the fee, without summing alternatives.
it("adds all matching quantities once, preserves existing prices, and recalculates full fee coverage independently", () => {
  const edited = { ...option, partnerAmountCents: 200000, label: "Reviewed paperback" };
  const candidates = [candidate,
    { ...candidate, sourceQuoteId: "00000000-0000-4000-8000-000000000002", quantity: 2000, printingCostCents: 216000 },
    { ...candidate, sourceQuoteId: "00000000-0000-4000-8000-000000000003", quantity: 3000, printingCostCents: 267000 },
    { ...candidate, sourceQuoteId: "00000000-0000-4000-8000-000000000004", currency: "EUR" },
  ];
  const all = addPartnerPrintOptions([edited], [...candidates, candidate], "USD", 40000, 40000, 1300);
  expect(all.map((row) => row.quantity)).toEqual([1000, 2000, 3000]);
  expect(all[0]).toEqual(edited);
  expect(addPartnerPrintOptions(all, candidates, "USD", 40000, 40000, 1300)).toEqual(all);
  for (const row of all) expect(expectedNetCents(40000 + row.partnerAmountCents, 1300)).toBeGreaterThanOrEqual(40000 + row.printingCostCents);
  const recalculated = fundPartnerPrintOptions(all, 40000, 40000, 2000);
  expect(recalculated.map((row) => row.partnerAmountCents)).toEqual([205000, 280000, 343750]);
  for (const row of recalculated) expect(expectedNetCents(40000 + row.partnerAmountCents, 2000)).toBe(40000 + row.printingCostCents);
  expect(all[0]).toEqual(edited);
});

// Prevent double-billing printing and presenting alternative quantities as cumulative costs.
it("replaces the selected printing line with independent prices and preserves legacy totals when options are inactive", () => {
  const options = [option, { ...option, sourceQuoteId: "00000000-0000-4000-8000-000000000002", quantity: 3000, partnerAmountCents: 310000 }];
  expect(partnerQuotePrices(items, options)).toEqual({ baseCents: 40000, minimumCents: 220000, maximumCents: 350000 });
  expect(partnerBaseItems(items, options).map((row) => row.id)).toEqual(["translation", "hidden"]);
  expect(partnerQuotePrices(items)).toEqual({ baseCents: 307000, minimumCents: 307000, maximumCents: 307000 });
});

// Protect finance snapshots from stale reads, cross-scope sources, and silent currency conversion.
it("only imports matching reviewed source amounts, while retaining an existing snapshot after a source changes", () => {
  expect(reviewPartnerPrintOptions([option], [], [candidate], "USD")).toEqual([option]);
  expect(() => reviewPartnerPrintOptions([option], [], [], "USD")).toThrow("unavailable");
  expect(() => reviewPartnerPrintOptions([option], [], [{ ...candidate, printingCostCents: 160000 }], "USD")).toThrow("changed");
  expect(() => reviewPartnerPrintOptions([option], [], [{ ...candidate, currency: "EUR" }], "USD")).toThrow("currency");
  expect(() => reviewPartnerPrintOptions([option], [option], [], "EUR")).toThrow("currency");
  expect(() => reviewPartnerPrintOptions([option, option], [], [candidate], "USD")).toThrow("once");
  const edited = { ...option, label: "Paperback printing", partnerAmountCents: 190000 };
  expect(reviewPartnerPrintOptions([edited], [option], [], "USD")).toEqual([edited]);
});

// One "Apply fee coverage" changes shared rates and printing prices together.
// The partner must pay the fee once: never short, and never charged twice.
it("prices each quantity against the shared rates being applied, so the whole project covers the fee exactly once", () => {
  const rates = suggestPartnerRates(partnerBaseItems(items, [option]), new Set(["translation"]), 3300);
  const [funded] = fundPartnerPrintOptionsForRates(items, [option], rates, 3300);
  const sharedCents = partnerQuoteTotalCents(applyPartnerRates(partnerBaseItems(items, [option]), rates));
  const projectCents = sharedCents + funded.partnerAmountCents;
  // Shared internal costs are 300 + 100 hidden; printing costs 1,560.
  expect(expectedNetCents(projectCents, 3300)).toBeGreaterThanOrEqual(40000 + 156000);
  expect(projectCents).toBe(grossTargetCents(40000 + 156000, 3300));
  // Pricing against the old shared subtotal would have charged more.
  expect(funded.partnerAmountCents).toBeLessThan(fundPartnerPrintOptions([option], 40000, 40000, 3300)[0].partnerAmountCents);
});
