import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";

import { buildQuotationWorkbook } from "@/lib/budget/export";
import type { BudgetLine, BudgetSettings } from "@/lib/budget/queries";

// 1×1 PNG so the logo path (addImage + dimension parsing) is exercised.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const settings = {
  currency: "USD",
  partnerName: "9Marks",
  partnerContactFirstName: "Judith",
  partnerContactEmail: "judith@9marks.org",
  partnerContact: "Prefers email",
  workDescription: "Khmer translation + print run",
} as unknown as BudgetSettings;

const items = [
  {
    group: "book_publishing",
    label: "Translation",
    unit: "words",
    quantity: "28403",
    unitPrice: "0.03",
    amount: "852.09",
  },
  {
    group: "book_publishing",
    label: "Printing — 3,000 copies (finalized)",
    unit: "flat",
    quantity: "1",
    unitPrice: "1980",
    amount: "1980",
  },
  {
    group: "additional_media",
    label: "Audiobook",
    unit: "words",
    quantity: "28403",
    unitPrice: "0.01",
    amount: "284.03",
  },
] as unknown as BudgetLine[];

async function reload(wb: ExcelJS.Workbook): Promise<ExcelJS.Workbook> {
  const buffer = await wb.xlsx.writeBuffer();
  const round = new ExcelJS.Workbook();
  await round.xlsx.load(buffer as ArrayBuffer);
  return round;
}

describe("buildQuotationWorkbook", () => {
  it("brands the sheet: accent bands, logo, accounting formats, highlighted total", async () => {
    const wb = buildQuotationWorkbook(settings, items, "Test Book", {
      accentColor: "#B65C3A",
      orgName: "Sastra",
      preparedByNote: "Prepared by the Sastra team",
      logo: { buffer: TINY_PNG, extension: "png" },
    });

    const round = await reload(wb);
    const ws = round.getWorksheet("Quotation");
    expect(ws).toBeTruthy();
    if (!ws) return;

    // Logo embedded.
    expect(round.model.media.filter((m) => m.type === "image")).toHaveLength(1);
    expect(ws.getImages()).toHaveLength(1);

    // A section band is filled with the accent color.
    const cells: string[] = [];
    ws.eachRow((r) =>
      r.eachCell((c) => {
        if (c.value === "PARTNER INFO") cells.push(c.address);
      })
    );
    expect(cells.length).toBe(1);
    const bandCell = ws.getCell(cells[0]);
    expect((bandCell.fill as ExcelJS.FillPattern)?.fgColor?.argb).toBe(
      "FFB65C3A"
    );

    // Money uses an accounting number format (aligned $, dash for zero).
    let sawAccounting = false;
    let sawTotalFormula = false;
    ws.eachRow((r) =>
      r.eachCell((c) => {
        if (typeof c.numFmt === "string" && c.numFmt.includes('"$"* ')) {
          sawAccounting = true;
        }
        const v = c.value as ExcelJS.CellFormulaValue;
        if (v && typeof v === "object" && "formula" in v && c.value) {
          if (String(v.formula).startsWith("SUM(")) sawTotalFormula = true;
        }
      })
    );
    expect(sawAccounting).toBe(true);
    expect(sawTotalFormula).toBe(true);

    // The org name + title are present.
    expect(ws.getCell("A1").value).toBe("Sastra");
    expect(ws.getCell("A2").value).toBe("PROJECT QUOTATION");
  });

  it("still works with no branding and a non-USD currency", async () => {
    const wb = buildQuotationWorkbook(
      { ...settings, currency: "KHR" } as unknown as BudgetSettings,
      items,
      "Test Book"
    );
    const round = await reload(wb);
    const ws = round.getWorksheet("Quotation");
    expect(ws).toBeTruthy();
    expect(round.model.media).toHaveLength(0);
  });

  it("labels an article quotation as article publishing", async () => {
    const wb = buildQuotationWorkbook(
      settings,
      items,
      "Article Collection",
      {},
      "article"
    );
    const round = await reload(wb);
    const ws = round.getWorksheet("Quotation");
    expect(ws).toBeTruthy();
    if (!ws) return;

    const labels: unknown[] = [];
    ws.eachRow((row) =>
      row.eachCell((cell) => {
        if (cell.value === "Article Publishing") labels.push(cell.value);
      })
    );
    expect(labels).toHaveLength(1);
  });
});
