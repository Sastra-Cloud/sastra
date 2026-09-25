import "server-only";

import ExcelJS from "exceljs";

import type { BudgetLine, BudgetSettings } from "@/lib/budget/queries";
import { budgetGroupLabel } from "@/lib/budget/compute";

export type QuotationBranding = {
  accentColor?: string | null;
  orgName?: string | null;
  preparedByNote?: string | null;
  logo?: { buffer: Buffer; extension: "png" | "jpeg" } | null;
};

const DEFAULT_ACCENT = "FFB65C3A";

/** Drop the in-app status suffix (e.g. "(finalized)") from a line label. */
function cleanLabel(label: string): string {
  return label.replace(
    /\s*\((?:finalized|estimate|awaiting quote)\)\s*$/i,
    ""
  );
}

/** Normalize a "#RRGGBB" (or "RRGGBB") value into ExcelJS "FFRRGGBB" argb. */
function toArgb(hex: string | null | undefined): string {
  const match = /^#?([0-9a-fA-F]{6})$/.exec((hex ?? "").trim());
  return match ? `FF${match[1].toUpperCase()}` : DEFAULT_ACCENT;
}

/** Pick readable text (white or near-black) for a given band fill. */
function contrastText(argb: string): string {
  const r = parseInt(argb.slice(2, 4), 16);
  const g = parseInt(argb.slice(4, 6), 16);
  const b = parseInt(argb.slice(6, 8), 16);
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance < 150 ? "FFFFFFFF" : "FF1A1A1A";
}

/** Read intrinsic pixel dimensions from a PNG or JPEG buffer (best-effort). */
function imageSize(
  buffer: Buffer,
  extension: "png" | "jpeg"
): { width: number; height: number } | null {
  try {
    if (extension === "png") {
      // IHDR width/height live at bytes 16–24 (8-byte sig + 4 len + 4 type).
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    // JPEG: walk the segment markers to the first Start-Of-Frame.
    let offset = 2;
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = buffer[offset + 1];
      if (marker >= 0xc0 && marker <= 0xc3) {
        return {
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7),
        };
      }
      offset += 2 + buffer.readUInt16BE(offset + 2);
    }
  } catch {
    // fall through
  }
  return null;
}

/**
 * Build a branded .xlsx that mirrors the team's quotation spreadsheet:
 * an optional logo, accent-colored PARTNER INFO / DESCRIPTION OF WORK /
 * ITEMIZED COSTS bands, QTY · UNIT · UNIT PRICE · AMOUNT with group subtotals,
 * and a highlighted grand total. Amounts/subtotals/total stay live formulas
 * (with cached results) so the file opens with the in-app numbers and remains
 * editable in Excel.
 */
export function buildQuotationWorkbook(
  settings: BudgetSettings,
  items: BudgetLine[],
  projectTitle: string,
  branding: QuotationBranding = {},
  projectKind?: string | null
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = branding.orgName || "Sastra";
  const ws = wb.addWorksheet("Quotation", {
    views: [{ showGridLines: false }],
    // Keep the AMOUNT/TOTAL columns on the page when printed or previewed.
    pageSetup: {
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.5,
        right: 0.5,
        top: 0.6,
        bottom: 0.6,
        header: 0.3,
        footer: 0.3,
      },
    },
  });

  ws.columns = [
    { key: "A", width: 10 },
    { key: "B", width: 28 },
    { key: "C", width: 2 },
    { key: "D", width: 2 },
    { key: "E", width: 8 },
    { key: "F", width: 8 },
    { key: "G", width: 11 },
    { key: "H", width: 2 },
    { key: "I", width: 13 },
    { key: "J", width: 2 },
  ];

  const accent = toArgb(branding.accentColor);
  const bandText = contrastText(accent);
  const moneyFmt =
    settings.currency === "USD"
      ? '_("$"* #,##0.00_);_("$"* (#,##0.00);_("$"* "-"??_);_(@_)'
      : `#,##0.00" ${settings.currency}"`;
  const qtyFmt = '_(* #,##0_);_(* (#,##0);_(* "-"??_);_(@_)';

  // Full-width accent band spanning A→J with a bold label in A.
  function band(rowNumber: number, label: string) {
    for (const col of "ABCDEFGHIJ") {
      const cell = ws.getCell(`${col}${rowNumber}`);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: accent } };
    }
    const labelCell = ws.getCell(`A${rowNumber}`);
    labelCell.value = label;
    labelCell.font = { bold: true, color: { argb: bandText } };
    labelCell.alignment = { vertical: "middle" };
    ws.getRow(rowNumber).height = 18;
    return labelCell;
  }

  // ── Header: org name, title, optional logo, prepared-by ──────────────────
  if (branding.orgName) {
    const org = ws.getCell("A1");
    org.value = branding.orgName;
    org.font = { bold: true, size: 12, color: { argb: accent } };
  }
  const title = ws.getCell("A2");
  title.value = "PROJECT QUOTATION";
  title.font = { bold: true, size: 26 };
  ws.getRow(2).height = 34;
  if (branding.preparedByNote) {
    const prep = ws.getCell("A3");
    prep.value = branding.preparedByNote;
    prep.font = { italic: true, size: 9, color: { argb: "FF777777" } };
  }

  if (branding.logo) {
    const dims = imageSize(branding.logo.buffer, branding.logo.extension);
    const maxW = 180;
    const maxH = 84;
    let width = maxW;
    let height = maxH;
    if (dims && dims.width > 0 && dims.height > 0) {
      const scale = Math.min(maxW / dims.width, maxH / dims.height);
      width = Math.round(dims.width * scale);
      height = Math.round(dims.height * scale);
    }
    const imageId = wb.addImage({
      buffer: branding.logo.buffer as unknown as ExcelJS.Buffer,
      extension: branding.logo.extension,
    });
    // Anchor toward the top-right, sized to fit the box while keeping aspect.
    ws.addImage(imageId, {
      tl: { col: 8.05, row: 0.2 } as ExcelJS.Anchor,
      ext: { width, height },
      editAs: "oneCell",
    });
  }

  // ── Partner info ─────────────────────────────────────────────────────────
  let row = 5;
  band(row, "PARTNER INFO");
  row++;
  if (settings.partnerName) {
    ws.getCell(`A${row}`).value = settings.partnerName;
    ws.getCell(`A${row}`).font = { bold: true };
    row++;
  }
  const contactName = [
    settings.partnerContactFirstName,
    settings.partnerContactLastName,
  ]
    .filter(Boolean)
    .join(" ");
  const attnParts = [contactName || null, settings.partnerContactEmail].filter(
    Boolean
  );
  if (attnParts.length) {
    ws.getCell(`A${row}`).value = `Attn: ${attnParts.join(" · ")}`;
    row++;
  }
  if (settings.partnerContact) {
    ws.getCell(`A${row}`).value = settings.partnerContact;
    ws.getCell(`A${row}`).font = { color: { argb: "FF777777" } };
    row++;
  }

  // ── Description of work ──────────────────────────────────────────────────
  row++;
  band(row, "DESCRIPTION OF WORK");
  row++;
  ws.getCell(`A${row}`).value = settings.workDescription ?? projectTitle;
  row += 2;

  // ── Itemized costs ───────────────────────────────────────────────────────
  const headerRow = row;
  band(headerRow, "ITEMIZED COSTS");
  for (const [col, label, align] of [
    ["E", "QTY", "center"],
    ["F", "UNIT", "center"],
    ["G", "UNIT PRICE", "center"],
    ["I", "AMOUNT", "center"],
  ] as const) {
    const cell = ws.getCell(`${col}${headerRow}`);
    cell.value = label;
    cell.font = { bold: true, color: { argb: bandText } };
    cell.alignment = { horizontal: align, vertical: "middle" };
  }
  row = headerRow + 1;

  // Book / project title line above the first group.
  ws.getCell(`A${row}`).value = projectTitle;
  ws.getCell(`A${row}`).font = { bold: true };
  row += 1;

  const subtotalCells: string[] = [];
  const order = ["book_publishing", "additional_media"] as const;

  for (const group of order) {
    const groupItems = items.filter((i) => i.group === group);
    if (groupItems.length === 0) continue;

    const groupBand = ws.getCell(`B${row}`);
    groupBand.value = budgetGroupLabel(group, projectKind);
    groupBand.font = { bold: true };
    groupBand.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF1EFEA" },
    };
    row++;

    const firstDataRow = row;
    for (const it of groupItems) {
      ws.getCell(`B${row}`).value = cleanLabel(it.label);
      const qty = ws.getCell(`E${row}`);
      qty.value = Number(it.quantity);
      qty.numFmt = qtyFmt;
      qty.alignment = { horizontal: "right" };
      ws.getCell(`F${row}`).value = it.unit;
      const price = ws.getCell(`G${row}`);
      price.value = Number(it.unitPrice);
      price.numFmt = moneyFmt;
      price.alignment = { horizontal: "right" };
      const amount = ws.getCell(`I${row}`);
      amount.value = { formula: `E${row}*G${row}`, result: Number(it.amount) };
      amount.numFmt = moneyFmt;
      amount.alignment = { horizontal: "right" };
      row++;
    }
    const lastDataRow = row - 1;

    ws.getCell(`G${row}`).value = "SUBTOTAL";
    ws.getCell(`G${row}`).font = { bold: true };
    ws.getCell(`G${row}`).alignment = { horizontal: "right" };
    const sub = ws.getCell(`I${row}`);
    const subResult = groupItems.reduce((s, i) => s + Number(i.amount), 0);
    sub.value = {
      formula: `SUM(I${firstDataRow}:I${lastDataRow})`,
      result: subResult,
    };
    sub.numFmt = moneyFmt;
    sub.font = { bold: true };
    sub.alignment = { horizontal: "right" };
    sub.border = { top: { style: "thin", color: { argb: "FF999999" } } };
    subtotalCells.push(`I${row}`);
    row += 2;
  }

  // ── Grand total (highlighted) ────────────────────────────────────────────
  const totalRow = row;
  for (const col of "GHIJ") {
    ws.getCell(`${col}${totalRow}`).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: accent },
    };
  }
  const totalLabel = ws.getCell(`G${totalRow}`);
  totalLabel.value = "TOTAL";
  totalLabel.font = { bold: true, size: 12, color: { argb: bandText } };
  totalLabel.alignment = { horizontal: "right", vertical: "middle" };
  const total = ws.getCell(`I${totalRow}`);
  const totalResult = items.reduce((s, i) => s + Number(i.amount), 0);
  total.value = {
    formula: subtotalCells.length ? `SUM(${subtotalCells.join(",")})` : "0",
    result: totalResult,
  };
  total.numFmt = moneyFmt;
  total.font = { bold: true, size: 12, color: { argb: bandText } };
  total.alignment = { horizontal: "right", vertical: "middle" };
  ws.getRow(totalRow).height = 20;

  return wb;
}
