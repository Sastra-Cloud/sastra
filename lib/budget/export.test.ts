import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";

import { buildQuotationWorkbook } from "@/lib/budget/export";
import type { BudgetLine, BudgetSettings } from "@/lib/budget/queries";

const settings = { currency: "USD", partnerName: "Example Partner" } as BudgetSettings;
const items = [
  { group: "book_publishing", label: "Translation", unit: "words", quantity: "28403", unitPrice: "0.03", amount: "852.09" },
  { group: "book_publishing", label: "Printing", unit: "flat", quantity: "1", unitPrice: "1980", amount: "1980" },
  { group: "additional_media", label: "Audiobook", unit: "words", quantity: "28403", unitPrice: "0.01", amount: "284.03" },
] as BudgetLine[];

describe("quotation workbook", () => {
  it("preserves line amounts and the grand total after serializing the editable workbook", async () => {
    const workbook = buildQuotationWorkbook(settings, items, "Example book");
    const saved = new ExcelJS.Workbook();
    await saved.xlsx.load(await workbook.xlsx.writeBuffer() as ArrayBuffer);
    const sheet = saved.getWorksheet("Quotation")!;
    const lineAmounts: number[] = [];
    let total: ExcelJS.CellFormulaValue | undefined;
    sheet.eachRow(row => {
      const amount = row.getCell("I").value as ExcelJS.CellFormulaValue | null;
      if (amount && typeof amount === "object" && "formula" in amount) {
        if (amount.formula.includes("*")) lineAmounts.push(amount.result as number);
        if (row.getCell("G").value === "TOTAL") total = amount;
      }
    });
    expect(lineAmounts).toEqual([852.09, 1980, 284.03]);
    expect(total?.result).toBeCloseTo(3116.12, 2);
    expect(total?.formula).toMatch(/^SUM\(/);
    sheet.eachRow(row => {
      if (row.getCell("B").value !== "Translation") return;
      expect((row.getCell("I").value as ExcelJS.CellFormulaValue).formula).toMatch(/^ROUND\(E\d+\*G\d+,2\)$/);
    });
  });
});
