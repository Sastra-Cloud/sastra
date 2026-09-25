import "server-only";

import PDFDocument from "pdfkit";

import type { InvoiceIssuerSnapshot } from "@/lib/workspace/queries";

const PAGE_MARGIN = 54;

function collect(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

// Format date-only values without timezone conversion.
function formatInvoiceDate(value: string) {
  return value.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$2/$3/$1");
}

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function addDocumentHeader(
  doc: PDFKit.PDFDocument,
  issuerName: string | null,
  title: string,
  accentColor = "#B65C3A"
) {
  if (issuerName) {
    doc
      .fillColor(accentColor)
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(issuerName.toUpperCase(), PAGE_MARGIN, PAGE_MARGIN);
  }
  doc
    .fillColor("#211F2D")
    .font("Helvetica-Bold")
    .fontSize(28)
    .text(title, PAGE_MARGIN, issuerName ? 76 : PAGE_MARGIN);
  doc
    .moveTo(PAGE_MARGIN, 118)
    .lineTo(doc.page.width - PAGE_MARGIN, 118)
    .strokeColor("#D9D1C5")
    .stroke();
}

export async function buildPerCopyQuotationPdf(input: {
  issuerName: string | null;
  accentColor?: string | null;
  projectTitle: string;
  partnerName: string | null;
  contactName: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  currency: string;
}): Promise<Buffer> {
  const doc = new PDFDocument({ size: "LETTER", margin: PAGE_MARGIN });
  const result = collect(doc);
  addDocumentHeader(
    doc,
    input.issuerName,
    "Project quotation",
    input.accentColor ?? undefined
  );

  let y = 145;
  doc.font("Helvetica-Bold").fontSize(15).fillColor("#211F2D").text(input.projectTitle, PAGE_MARGIN, y);
  y += 28;
  if (input.partnerName || input.contactName) {
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#6B6678")
      .text(
        [input.partnerName, input.contactName].filter(Boolean).join(" · "),
        PAGE_MARGIN,
        y
      );
    y += 26;
  }
  doc
    .font("Helvetica")
    .fontSize(11)
    .fillColor("#37333F")
    .text(input.description, PAGE_MARGIN, y, {
      width: doc.page.width - PAGE_MARGIN * 2,
      lineGap: 3,
    });
  y = doc.y + 30;

  doc.roundedRect(PAGE_MARGIN, y, doc.page.width - PAGE_MARGIN * 2, 94, 8).fill("#F7F4EF");
  doc
    .fillColor("#6B6678")
    .font("Helvetica")
    .fontSize(9)
    .text("QUANTITY", PAGE_MARGIN + 18, y + 18)
    .text("PRICE PER COPY", 235, y + 18)
    .text("TOTAL", 408, y + 18);
  doc
    .fillColor("#211F2D")
    .font("Helvetica-Bold")
    .fontSize(16)
    .text(input.quantity.toLocaleString("en-US"), PAGE_MARGIN + 18, y + 43)
    .text(formatMoney(input.unitPrice, input.currency), 235, y + 43)
    .text(
      formatMoney(input.quantity * input.unitPrice, input.currency),
      408,
      y + 43
    );

  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#6B6678")
    .text(
      "This partner quotation intentionally summarizes the project as one price per copy.",
      PAGE_MARGIN,
      y + 122
    );
  doc.end();
  return result;
}

export async function buildInvoicePdf(input: {
  issuer: InvoiceIssuerSnapshot;
  logo?: Buffer | null;
  invoiceNumber: string;
  projectTitle: string;
  recipientName: string | null;
  recipientEmail: string | null;
  recipientAddress?: string | null;
  amount: number;
  currency: string;
  issueDate: string;
  dueDate: string | null;
  description: string;
}): Promise<Buffer> {
  const doc = new PDFDocument({ size: "LETTER", margin: PAGE_MARGIN });
  const result = collect(doc);
  const width = doc.page.width - PAGE_MARGIN * 2;
  const right = doc.page.width - PAGE_MARGIN;
  const accent = input.issuer.accentColor || "#56748A";
  const ink = "#292929";
  const issuerName = input.issuer.legalName || input.issuer.orgName || "";
  doc.font("Helvetica-Bold").fontSize(11).fillColor(ink).text(issuerName, PAGE_MARGIN, 48, { width: 320 });
  doc.font("Helvetica").fontSize(9).text([
    ...input.issuer.address, input.issuer.contactPhone, input.issuer.contactEmail,
    input.issuer.registrationNumber ? `Registration: ${input.issuer.registrationNumber}` : null,
    input.issuer.taxId ? `Tax ID: ${input.issuer.taxId}` : null,
  ].filter(Boolean).join("\n"), PAGE_MARGIN, doc.y + 5, { width: 310, lineGap: 2 });
  const headerBottom = doc.y;
  if (input.logo) doc.image(input.logo, right - 130, 48, { fit: [130, 65], align: "right" });
  const barY = Math.max(138, headerBottom + 20);
  doc.rect(PAGE_MARGIN, barY, width, 29).fill(accent);
  doc.font("Helvetica").fontSize(13).fillColor("white")
    .text(`INVOICE NO. ${input.invoiceNumber}`, PAGE_MARGIN + 8, barY + 8, { width: width - 125 })
    .text(formatInvoiceDate(input.issueDate), right - 115, barY + 8, { width: 107, align: "right" });
  let y = barY + 49;
  doc.fillColor(accent).fontSize(9).text("BILL TO", PAGE_MARGIN + 5, y);
  doc.text("INSTRUCTIONS", PAGE_MARGIN + width / 2, y);
  doc.moveTo(PAGE_MARGIN, y + 15).lineTo(right, y + 15).strokeColor(accent).stroke();
  doc.fillColor(ink).fontSize(10).text([input.recipientName, input.recipientAddress].filter(Boolean).join("\n"), PAGE_MARGIN + 5, y + 22, { width: width / 2 - 16, lineGap: 2 });
  const billBottom = doc.y;
  doc.fontSize(9).text(input.dueDate ? `Payment due: ${formatInvoiceDate(input.dueDate)}\nCurrency: ${input.currency}` : `Currency: ${input.currency}`, PAGE_MARGIN + width / 2, y + 22, { width: width / 2 });
  y = Math.max(billBottom, doc.y) + 22;
  doc.rect(PAGE_MARGIN, y, width, 24).fill(accent);
  doc.fillColor("white").fontSize(9).text("DESCRIPTION", PAGE_MARGIN + 5, y + 8, { width: 300 })
    .text("UNIT PRICE", right - 166, y + 8, { width: 76, align: "right" })
    .text("TOTAL", right - 80, y + 8, { width: 75, align: "right" });
  y += 33;
  doc.fillColor(ink).fontSize(10).text(input.description, PAGE_MARGIN + 5, y, { width: width - 188, lineGap: 2 });
  const bottom = doc.y;
  doc.text(formatMoney(input.amount, input.currency), right - 174, y, { width: 84, align: "right" })
    .text(formatMoney(input.amount, input.currency), right - 84, y, { width: 79, align: "right" });
  y = Math.max(bottom, doc.y) + 16;
  doc.moveTo(PAGE_MARGIN, y).lineTo(right, y).strokeColor("#CCCCCC").stroke();
  doc.font("Helvetica-Bold").fontSize(12).text(`Total: ${formatMoney(input.amount, input.currency)}`, PAGE_MARGIN, y + 12, { width, align: "right" });
  const details = input.issuer.invoicePaymentDetails;
  if (details?.fields.length || input.issuer.paymentInstructions) {
    doc.addPage();
    addDocumentHeader(doc, issuerName, details?.title || "Payment instructions", accent);
    y = 144;
    for (const field of details?.fields ?? []) {
      if (!field.value.trim()) continue;
      doc.font("Helvetica").fontSize(10);
      const rowHeight = Math.max(doc.font("Helvetica-Bold").heightOfString(field.label, { width: 155 }), doc.font("Helvetica").heightOfString(field.value, { width: width - 193 })) + 18;
      if (y + rowHeight > doc.page.height - PAGE_MARGIN) { doc.addPage(); y = PAGE_MARGIN; }
      doc.rect(PAGE_MARGIN, y, width, rowHeight).strokeColor("#D7D7D7").stroke();
      doc.rect(PAGE_MARGIN, y, 175, rowHeight).fill("#F2F4F5");
      doc.fillColor(ink).font("Helvetica-Bold").text(field.label, PAGE_MARGIN + 8, y + 8, { width: 155 });
      doc.font("Helvetica").text(field.value, PAGE_MARGIN + 183, y + 8, { width: width - 193 });
      y += rowHeight;
    }
    if (input.issuer.paymentInstructions) {
      if (y + 70 > doc.page.height - PAGE_MARGIN) { doc.addPage(); y = PAGE_MARGIN; }
      doc.font("Helvetica").fontSize(10).fillColor(ink).text(input.issuer.paymentInstructions, PAGE_MARGIN, y + 22, { width, lineGap: 4 });
    }
  }
  doc.end();
  return result;
}
