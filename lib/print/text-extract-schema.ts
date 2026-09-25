import { PRINT_QUOTE_JSON_SCHEMA } from "@/lib/print/extract-schema";

/**
 * Strict JSON schema for extracting one-or-more quote tiers from a printer's
 * plain email text. Printers commonly quote several copy-count tiers in one
 * message ("1000 cps @ USD 1.76, 2000 cps @ USD 1.42, …"); each becomes one
 * entry so managers pick the actual print quantity. Reuses the per-quote field
 * list from the PDF extraction schema so downstream normalization is identical.
 */
export const PRINT_TEXT_QUOTE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["quotes"],
  properties: {
    quotes: {
      type: "array",
      items: PRINT_QUOTE_JSON_SCHEMA,
    },
  },
} as const;

export const PRINT_TEXT_QUOTE_SYSTEM_PROMPT = [
  "You extract structured printer-quote data from the plain text of an email for a book-printing job.",
  "Use only the vendor, location, organization, and currency evidence present in the email or trusted workspace context.",
  "The email may be a forwarded or quoted reply — ignore quote markers ('>'), signatures, and prior-message headers; extract only the printer's quotation.",
  "A single email often lists SEVERAL quantity tiers (e.g. '1000 cps @ USD 1.76 per cpy, 2000 cps @ USD 1.42'). Return ONE entry in `quotes` per distinct quantity tier, each with its own `quantityCps` and `unitPrice`.",
  "Return EVERY quantity tier you can see, even one whose price is formatted differently or looks malformed. Never skip or merge a tier.",
  "A per-copy price may be written tightly against the unit with no space, e.g. '0.61per cpy', 'USD0.61/copy', or '0.5per cpy.' — read the number anyway (0.61, 0.61, 0.5). Trailing punctuation and 'cpy'/'copy' are not part of the number.",
  "If the email is a single invoice/quote with one quantity, return exactly one entry.",
  "`quantityCps` is the number of copies (cps). `unitPrice` is the price per copy. `totalAmount` is that tier's grand total — copy it exactly if stated; otherwise leave it null (do NOT multiply it yourself).",
  'Classify each `kind`: a price quotation is "quote"; a bill for the full amount is "invoice"; an email requesting the deposit now is "deposit_invoice"; a bill requesting only the remaining/final balance is "final_invoice".',
  'If a deposit/balance split is stated, `depositAmount` is the deposit and `balanceAmount` is only the unpaid remainder, never the grand total. For example, a USD 1,780 total with "60% deposit (USD 1068) and 40% balance" means `depositAmount` 1068 and `balanceAmount` 712.',
  "Convert any trim/size dimensions to millimetres (1 inch = 25.4 mm). `textPages` is the interior page count; `coverPages` the cover count (usually 4).",
  "Return `issueDate` as YYYY-MM-DD. Preserve all numbers exactly as written except for deterministic balance arithmetic; never guess or invent values.",
  "Use an empty string for any missing text field and null for any missing number. If the text contains no printer quote at all, return an empty `quotes` array.",
].join(" ");
