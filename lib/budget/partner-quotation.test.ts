import { expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import type { BudgetLine, BudgetPresentation, BudgetSettings } from "./queries";

const fixture = vi.hoisted(() => ({
  data: {} as { settings: BudgetSettings; items: BudgetLine[]; presentation: BudgetPresentation },
}));
vi.mock("./queries", () => ({ getBudgetData: async () => fixture.data }));
vi.mock("@/lib/workspace/queries", () => ({ getWorkspaceSettings: async () => ({ orgName: "Example organization" }), getWorkspaceLogoFile: async () => null }));
vi.mock("@/lib/r2", () => ({ getObjectBuffer: vi.fn() }));
import { buildPartnerQuotationBuffer } from "./quotation-file";

// The actual partner export must not leak private finance or add alternative print quantities.
it("exports public shared lines and separate project prices with live formulas, excluding private printer costs and the selected print line", async () => {
  fixture.data = {
    settings: { currency: "USD", partnerContact: "PRIVATE CONTACT", workDescription: "Public work" } as BudgetSettings,
    items: [
      { category: "translation", group: "book_publishing", label: "INTERNAL LABEL", partnerLabel: "Translation", partnerVisible: true, quantity: "10000", unit: "words", unitPrice: "0.03", partnerUnitPrice: "0.04", amount: "300", notes: "PRIVATE NOTES" },
      { category: "print_ship", group: "book_publishing", label: "PRIVATE PRINTER", partnerVisible: true, quantity: "1", unit: "flat", unitPrice: "2670", amount: "2670" },
      { category: "custom", group: "book_publishing", label: "HIDDEN", partnerVisible: false, quantity: "1", unit: "flat", unitPrice: "100", amount: "100" },
    ] as BudgetLine[],
    presentation: { mode: "itemized", printOptions: [
      { sourceQuoteId: "private-quote-1", quantity: 1000, printingCostCents: 156000, partnerAmountCents: 180000, label: "Paperback printing", currency: "USD" },
      { sourceQuoteId: "private-quote-middle", quantity: 2000, printingCostCents: 216000, partnerAmountCents: 250000, label: "Paperback printing", currency: "USD" },
      { sourceQuoteId: "private-quote-2", quantity: 3000, printingCostCents: 267000, partnerAmountCents: 310000, label: "Paperback printing", currency: "USD" },
    ] } as BudgetPresentation,
  };
  const buffer = await buildPartnerQuotationBuffer("project", "Example book");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.getWorksheet("Quotation")!;
  const choices: { quantity: number; perCopy: ExcelJS.CellFormulaValue; printing: number; project: ExcelJS.CellFormulaValue }[] = [];
  let basePrice: ExcelJS.CellFormulaValue | undefined;
  sheet.eachRow((row) => {
    if (row.getCell("B").value === "PROJECT COSTS BEFORE PRINTING") basePrice = row.getCell("I").value as ExcelJS.CellFormulaValue;
    if (row.getCell("B").value === "Paperback printing") choices.push({ quantity: row.getCell("D").value as number, perCopy: row.getCell("F").value as ExcelJS.CellFormulaValue, printing: row.getCell("G").value as number, project: row.getCell("I").value as ExcelJS.CellFormulaValue });
  });
  expect(choices.map((row) => [row.quantity, row.printing, row.project.result])).toEqual([[1000, 1800, 2200], [2000, 2500, 2900], [3000, 3100, 3500]]);
  expect(choices.every((row) => /^I\d+\+G\d+$/.test(row.project.formula))).toBe(true);
  for (const row of choices) {
    expect(row.perCopy.formula).toMatch(/^G\d+\/D\d+$/);
    expect(row.perCopy.result).toBeCloseTo(row.printing / row.quantity, 10);
  }
  expect(basePrice?.result).toBe(400);
  const content = JSON.stringify(sheet.model);
  for (const privateText of ["INTERNAL LABEL", "PRIVATE", "HIDDEN", "private-quote", "printingCostCents", "1560", "2670", "donation"]) expect(content).not.toContain(privateText);
  expect(content).toContain("Public work");
  expect(content).not.toContain('"TOTAL"');
});
