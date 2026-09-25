import { z } from "zod";

import {
  isoDate,
  reconcilePrintPaymentAmounts,
  type ParsedPrinterQuote,
} from "@/lib/print/parser";

/**
 * Strict-mode JSON Schema for OpenRouter `response_format` when extracting a
 * printer quotation/invoice. Every property is listed in `required` and objects
 * set `additionalProperties:false`. Text fields are plain `string` (the model
 * returns "" when absent, mapped back to null in `normalizePrintQuoteExtract`);
 * only numeric fields are nullable unions, keeping unions well under Anthropic's
 * 16-union limit.
 */
export const PRINT_QUOTE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "kind",
    "invoiceNumber",
    "issueDate",
    "title",
    "quantityCps",
    "unitPrice",
    "totalAmount",
    "depositAmount",
    "balanceAmount",
    "currency",
    "trimWidthMm",
    "trimHeightMm",
    "textPages",
    "coverPages",
    "textSpec",
    "coverSpec",
    "binding",
    "deliveryLocation",
    "paymentTerms",
  ],
  properties: {
    kind: {
      type: "string",
      enum: ["quote", "invoice", "deposit_invoice", "final_invoice"],
    },
    invoiceNumber: { type: "string" },
    issueDate: { type: "string" },
    title: { type: "string" },
    quantityCps: { type: ["integer", "null"] },
    unitPrice: { type: ["number", "null"] },
    totalAmount: { type: ["number", "null"] },
    depositAmount: { type: ["number", "null"] },
    balanceAmount: { type: ["number", "null"] },
    currency: { type: "string" },
    trimWidthMm: { type: ["number", "null"] },
    trimHeightMm: { type: ["number", "null"] },
    textPages: { type: ["integer", "null"] },
    coverPages: { type: ["integer", "null"] },
    textSpec: { type: "string" },
    coverSpec: { type: "string" },
    binding: { type: "string" },
    deliveryLocation: { type: "string" },
    paymentTerms: { type: "string" },
  },
} as const;

export const PRINT_QUOTE_SYSTEM_PROMPT = [
  "You extract structured data from a printer's quotation or invoice for a book-printing job.",
  "Use only the vendor, location, organization, and currency evidence present in the document or trusted workspace context.",
  'Classify `kind`: a price quotation is "quote"; a bill for the full amount is "invoice"; a document or filename labeled deposit invoice, or requesting the deposit now, is "deposit_invoice"; a bill requesting only the remaining/final balance is "final_invoice".',
  "`quantityCps` is the number of copies (cps). `unitPrice` is the price per copy. `totalAmount` is the grand total.",
  'If a deposit/balance split is stated, `depositAmount` is the deposit and `balanceAmount` is only the unpaid remainder, never the grand total. For example, a USD 1,780 total with "60% deposit (USD 1068) and 40% balance" means `depositAmount` 1068 and `balanceAmount` 712.',
  "Convert any trim/size dimensions to millimetres (1 inch = 25.4 mm).",
  '`textPages` is the interior/text page count (e.g. "140 PP text"); `coverPages` is the cover page count (usually 4).',
  "Return `issueDate` as YYYY-MM-DD. Preserve all numbers exactly as written except for deterministic balance arithmetic; never guess or invent values.",
  "Use an empty string for any missing text field and null for any missing number.",
].join(" ");

/**
 * Structural validation of the model's raw extraction. Deliberately lenient on
 * value types (models legitimately wobble between number and numeric-string, or
 * emit null vs ""), but rejects fundamentally wrong output — an array, a
 * non-object, or a field of a wholly unexpected type — so garbage never flows
 * silently into a suggested quote. `normalizePrintQuoteExtract` coerces from here.
 */
const numeric = z.union([z.number(), z.string(), z.null()]).optional();
const textish = z.union([z.string(), z.null()]).optional();

export const printQuoteExtractZ = z
  .object({
    kind: textish,
    invoiceNumber: textish,
    issueDate: textish,
    title: textish,
    quantityCps: numeric,
    unitPrice: numeric,
    totalAmount: numeric,
    depositAmount: numeric,
    balanceAmount: numeric,
    currency: textish,
    trimWidthMm: numeric,
    trimHeightMm: numeric,
    textPages: numeric,
    coverPages: numeric,
    textSpec: textish,
    coverSpec: textish,
    binding: textish,
    deliveryLocation: textish,
    paymentTerms: textish,
  })
  .passthrough();

function str(value: unknown): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  return s.length ? s : null;
}

function num(value: unknown): number | null {
  // Treat null/undefined/"" as missing — NOT 0. Coercing a missing total to 0
  // would otherwise falsely trip the computed-total-mismatch review flag.
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Map the AI's structured output onto the same shape the regex parser emits.
 * Validates structure at the boundary (throws a descriptive error the caller
 * records on the extraction job) before coercing values.
 */
export function normalizePrintQuoteExtract(
  raw: unknown,
  context?: { sourceFileName?: string | null }
): ParsedPrinterQuote {
  const result = printQuoteExtractZ.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `AI returned a malformed quote extraction: ${result.error.issues
        .map((i) => `${i.path.join(".") || "(root)"} ${i.message}`)
        .join("; ")}`
    );
  }
  const r = result.data as Record<string, unknown>;

  const kindRaw = str(r.kind);
  let kind: ParsedPrinterQuote["kind"] =
    kindRaw === "invoice" ||
    kindRaw === "deposit_invoice" ||
    kindRaw === "final_invoice"
      ? kindRaw
      : "quote";
  const sourceFileName = context?.sourceFileName?.trim() ?? "";
  if (/\bdeposit[\s_-]*invoice\b/i.test(sourceFileName)) {
    kind = "deposit_invoice";
  } else if (/\b(?:final|balance)[\s_-]*invoice\b/i.test(sourceFileName)) {
    kind = "final_invoice";
  }

  const money = (v: unknown): string | null => {
    const n = num(v);
    return n != null ? n.toFixed(2) : null;
  };
  const rate = (v: unknown): string | null => {
    const n = num(v);
    return n != null ? n.toFixed(3) : null;
  };
  const intOrNull = (v: unknown): number | null => {
    const n = num(v);
    return n != null ? Math.round(n) : null;
  };
  const mm = (v: unknown): string | null => {
    const n = num(v);
    return n != null ? n.toFixed(2) : null;
  };

  const normalized: ParsedPrinterQuote = {
    kind,
    invoiceNumber: str(r.invoiceNumber),
    issueDate: isoDate(str(r.issueDate)),
    title: str(r.title),
    quantityCps: intOrNull(r.quantityCps),
    unitPrice: rate(r.unitPrice),
    totalAmount: money(r.totalAmount),
    depositAmount: money(r.depositAmount),
    balanceAmount: money(r.balanceAmount),
    currency: str(r.currency) ?? "USD",
    trimWidthMm: mm(r.trimWidthMm),
    trimHeightMm: mm(r.trimHeightMm),
    textPages: intOrNull(r.textPages),
    coverPages: intOrNull(r.coverPages),
    textSpec: str(r.textSpec),
    coverSpec: str(r.coverSpec),
    binding: str(r.binding),
    deliveryLocation: str(r.deliveryLocation),
    paymentTerms: str(r.paymentTerms),
    latestProofUrl: null,
  };
  const paymentAmounts = reconcilePrintPaymentAmounts(normalized);
  normalized.depositAmount = paymentAmounts.depositAmount;
  normalized.balanceAmount = paymentAmounts.balanceAmount;
  return normalized;
}
