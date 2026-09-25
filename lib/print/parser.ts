import { parseFlexibleDate } from "@/lib/print/dates";

export type ParsedPrinterQuote = {
  kind: "quote" | "invoice" | "deposit_invoice" | "final_invoice";
  invoiceNumber: string | null;
  issueDate: string | null;
  title: string | null;
  quantityCps: number | null;
  unitPrice: string | null;
  totalAmount: string | null;
  depositAmount: string | null;
  balanceAmount: string | null;
  currency: string;
  trimWidthMm: string | null;
  trimHeightMm: string | null;
  textPages: number | null;
  coverPages: number | null;
  textSpec: string | null;
  coverSpec: string | null;
  binding: string | null;
  deliveryLocation: string | null;
  paymentTerms: string | null;
  latestProofUrl: string | null;
};

const EMPTY: ParsedPrinterQuote = {
  kind: "quote",
  invoiceNumber: null,
  issueDate: null,
  title: null,
  quantityCps: null,
  unitPrice: null,
  totalAmount: null,
  depositAmount: null,
  balanceAmount: null,
  currency: "USD",
  trimWidthMm: null,
  trimHeightMm: null,
  textPages: null,
  coverPages: null,
  textSpec: null,
  coverSpec: null,
  binding: null,
  deliveryLocation: null,
  paymentTerms: null,
  latestProofUrl: null,
};

function cleanMoney(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n.toFixed(2) : null;
}

function cleanRate(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n.toFixed(3) : null;
}

function cleanInt(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n) : null;
}

function moneyCents(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const numeric =
    typeof value === "number" ? value : Number(value.replace(/,/g, ""));
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : null;
}

function centsAsMoney(value: number | null): string | null {
  return value == null ? null : (value / 100).toFixed(2);
}

/**
 * Normalize staged printer-payment amounts. Models sometimes copy the invoice
 * grand total into `balanceAmount`, or leave the balance blank when only its
 * percentage is printed. A positive deposit below the order total makes the
 * remaining balance deterministic: total minus deposit.
 */
export function reconcilePrintPaymentAmounts(input: {
  totalAmount: string | number | null | undefined;
  depositAmount: string | number | null | undefined;
  balanceAmount: string | number | null | undefined;
}): { depositAmount: string | null; balanceAmount: string | null } {
  const total = moneyCents(input.totalAmount);
  const deposit = moneyCents(input.depositAmount);
  const suppliedBalance = moneyCents(input.balanceAmount);
  const hasStagedTotal =
    total != null && deposit != null && deposit > 0 && total >= deposit;
  const balanceMistakenForTotal =
    hasStagedTotal && suppliedBalance != null && suppliedBalance === total;
  const balance =
    hasStagedTotal && (suppliedBalance == null || balanceMistakenForTotal)
      ? total - deposit
      : suppliedBalance;

  return {
    depositAmount: centsAsMoney(deposit),
    balanceAmount: centsAsMoney(balance),
  };
}

/** Resolve the payable final amount without ever reusing a staged grand total. */
export function resolveFinalPrintPaymentAmount(input: {
  totalAmount: string | number | null | undefined;
  depositAmount: string | number | null | undefined;
  balanceAmount: string | number | null | undefined;
}): string | null {
  const reconciled = reconcilePrintPaymentAmounts(input);
  if (reconciled.balanceAmount != null) {
    return Number(reconciled.balanceAmount) > 0
      ? reconciled.balanceAmount
      : null;
  }
  const total = moneyCents(input.totalAmount);
  return total != null && total > 0 ? centsAsMoney(total) : null;
}

export function isoDate(raw: string | undefined | null): string | null {
  return parseFlexibleDate(raw).iso;
}

function firstLineValue(lines: string[], label: RegExp): string | null {
  const line = lines.find((l) => label.test(l));
  if (!line) return null;
  return line.replace(label, "").trim() || null;
}

function normalizeDimensionToMm(value: number, unit: string | undefined): number {
  const u = (unit ?? "mm").toLowerCase();
  if (u === "in" || u === "inch" || u === "inches") return value * 25.4;
  if (u === "cm" && value <= 50) return value * 10;
  return value;
}

function compactSpec(value: string | null | undefined): string | null {
  const compact = value?.replace(/\s+/g, " ").trim();
  return compact || null;
}

function joinSpecs(...values: Array<string | null | undefined>): string | null {
  const specs = values.map(compactSpec).filter((value): value is string => !!value);
  return specs.length ? specs.join("; ") : null;
}

function inferQuoteTitle(lines: string[]): string | null {
  const candidate = lines.find(
    (line) =>
      !/^(?:from|to|cc|date|subject|size|trim|color|paper|finish|binding|deliver|delivery|payment|invoice|issued|spec)\s*:/i.test(
        line
      ) &&
      !/^\d[\d,]*\s*(?:cps?|copies)\b/i.test(line) &&
      !/^[-–—\s]+$/.test(line)
  );
  return candidate?.trim() || null;
}

export function extractLatestProofUrl(text: string): string | null {
  const matches = [
    ...text.matchAll(/\bhttps?:\/\/(?:we\.tl|wetransfer\.com)\/[^\s<>)]+/gi),
  ];
  return matches.at(-1)?.[0] ?? null;
}

function cleanQuotedEmailText(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^(?:>\s*)+/, "").trim())
    .join("\n");
}

export function parsePrinterQuoteText(text: string): ParsedPrinterQuote {
  const normalized = cleanQuotedEmailText(text);
  const lines = normalized
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const parsed: ParsedPrinterQuote = { ...EMPTY };
  parsed.latestProofUrl = extractLatestProofUrl(normalized);

  const invoice = normalized.match(/INVOICE\s+No:\s*#?\s*([A-Z0-9-]+)/i);
  parsed.invoiceNumber = invoice?.[1] ?? null;
  parsed.issueDate = isoDate(
    normalized.match(/Issued\s+in:\s*([0-9/-]+)/i)?.[1] ?? null
  );
  if (parsed.invoiceNumber) parsed.kind = "invoice";

  for (const line of lines) {
    const row = line.match(
      /^(.+?)\s+(\d{3,6})\s+([0-9]+(?:\.[0-9]{2,3})?)\s+([0-9,]+\.[0-9]{2})$/
    );
    if (row && !/^deposit$/i.test(row[1].trim())) {
      parsed.title = row[1].trim();
      parsed.quantityCps = Number(row[2]);
      parsed.unitPrice = cleanRate(row[3]);
      parsed.totalAmount = cleanMoney(row[4]);
      break;
    }
  }

  const depositLine = lines.find((l) => /^Deposit\b/i.test(l));
  if (depositLine) {
    parsed.depositAmount = cleanMoney(
      depositLine.match(/-?\s*([0-9,]+\.[0-9]{2})/)?.[1]
    );
    parsed.kind = "final_invoice";
  }

  const totalLine = [...lines].reverse().find((l) => /\bTotal:\s*/i.test(l));
  if (totalLine) {
    const amount = cleanMoney(totalLine.match(/Total:\s*([0-9,]+\.[0-9]{2})/i)?.[1]);
    if (parsed.depositAmount) parsed.balanceAmount = amount;
    else if (!parsed.totalAmount) parsed.totalAmount = amount;
  }

  const trim = normalized.match(
    /(?:Trim\s+size|Size):\s*([0-9.]+)\s*(mm|cm|in|inch|inches)?\s*(?:x|×)\s*([0-9.]+)\s*(mm|cm|in|inch|inches)?/i
  );
  if (trim) {
    const widthUnit = trim[2] ?? trim[4];
    const heightUnit = trim[4] ?? trim[2];
    parsed.trimWidthMm = normalizeDimensionToMm(
      Number(trim[1]),
      widthUnit
    ).toFixed(2);
    parsed.trimHeightMm = normalizeDimensionToMm(
      Number(trim[3]),
      heightUnit
    ).toFixed(2);
  }

  const textPages =
    normalized.match(/(\d+)\s*PP\s*text/i)?.[1] ??
    normalized.match(/(\d+)\s+pages/i)?.[1] ??
    normalized.match(/(\d+)\s*PP\s*\+\s*\d+\s*pp\s*Cover/i)?.[1] ??
    normalized.match(
      /(?:Trim\s+size|Size):[^\n,]*,\s*(\d+)\s*PP\b/i
    )?.[1];
  parsed.textPages = textPages ? Number(textPages) : null;
  const coverPages =
    normalized.match(/(\d+)\s*pp\s*Cover/i)?.[1] ??
    normalized.match(/\+\s*(\d+)\s*Cover/i)?.[1];
  parsed.coverPages = coverPages ? Number(coverPages) : null;

  const paperBlock = normalized.match(
    /\bPaper:\s*([\s\S]*?)(?=\n\s*(?:Finish|Binding|Deliver|Delivery|Payment)\b|$)/i
  )?.[1];
  const paperCover = paperBlock?.match(
    /\bCover:\s*([\s\S]*?)(?=\bInside:\s*|$)/i
  )?.[1];
  const paperInside = paperBlock?.match(/\bInside:\s*([\s\S]*)$/i)?.[1];
  const colorLine = firstLineValue(lines, /^Color:\s*/i);
  const coverColor = colorLine?.match(
    /\bCover:\s*(.*?)(?=,\s*Inside:|$)/i
  )?.[1];
  const insideColor = colorLine?.match(/\bInside:\s*(.*)$/i)?.[1];

  parsed.textSpec = joinSpecs(
    firstLineValue(lines, /^Text:\s*/i),
    insideColor,
    paperInside
  );
  parsed.coverSpec = joinSpecs(
    firstLineValue(lines, /^Cover:\s*/i),
    coverColor,
    paperCover
  );
  parsed.binding =
    firstLineValue(lines, /^Binding\s*:?\s*/i) ??
    firstLineValue(lines, /^Finish\s*:?\s*/i);
  parsed.deliveryLocation = firstLineValue(lines, /^Deliver(?:y)?\s+to\s*/i);
  parsed.paymentTerms = firstLineValue(lines, /^Payment\s+term:\s*/i);

  const depositTerm = parsed.paymentTerms?.match(/deposit\s*\(USD\s*([0-9,.]+)/i);
  if (!parsed.depositAmount && depositTerm) {
    parsed.depositAmount = cleanMoney(depositTerm[1]);
    parsed.kind = "deposit_invoice";
  }

  const balanceTerm =
    parsed.paymentTerms?.match(
      /balance\s*\((?:USD\s*)?([0-9,.]+)/i
    )?.[1] ??
    parsed.paymentTerms?.match(
      /\((?:USD\s*)?([0-9,.]+)\)\s*balance/i
    )?.[1];
  if (!parsed.balanceAmount && balanceTerm) {
    parsed.balanceAmount = cleanMoney(balanceTerm);
  }

  const paymentAmounts = reconcilePrintPaymentAmounts(parsed);
  parsed.depositAmount = paymentAmounts.depositAmount;
  parsed.balanceAmount = paymentAmounts.balanceAmount;

  return parsed;
}

function quoteTierMatches(text: string): Array<{
  quantityCps: number;
  unitPrice: string;
  totalAmount: string;
}> {
  const tiers: Array<{
    quantityCps: number;
    unitPrice: string;
    totalAmount: string;
  }> = [];
  const seen = new Set<string>();

  const patterns = [
    /\b([0-9][0-9,]{2,})\s*(?:cps?|copies)\s*@\s*(?:USD\s*)?([0-9]+(?:\.[0-9]{1,3})?)\s*(?:per\s*(?:cpy|copy)|\/\s*(?:cpy|copy))?/gi,
    /\b([0-9][0-9,]{2,})\s*(?:cps?|copies)\b[^\n$]{0,30}?\bUSD\s*([0-9]+(?:\.[0-9]{1,3})?)\b/gi,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const quantityCps = cleanInt(match[1]);
      const unitPrice = cleanRate(match[2]);
      if (!quantityCps || !unitPrice) continue;
      const key = `${quantityCps}:${unitPrice}`;
      if (seen.has(key)) continue;
      seen.add(key);
      tiers.push({
        quantityCps,
        unitPrice,
        totalAmount: (quantityCps * Number(unitPrice)).toFixed(2),
      });
    }
  }

  return tiers;
}

/**
 * Printer emails often quote several copy-count tiers in one message. Return
 * one parsed quote per tier so managers can accept the actual print quantity.
 */
export function parsePrinterQuoteTextVariants(text: string): ParsedPrinterQuote[] {
  const base = parsePrinterQuoteText(text);
  const tiers = quoteTierMatches(cleanQuotedEmailText(text));
  if (!tiers.length) return [base];
  if (!base.title) {
    const lines = cleanQuotedEmailText(text)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    base.title = inferQuoteTitle(lines);
  }
  return tiers.map((tier) => ({
    ...base,
    quantityCps: tier.quantityCps,
    unitPrice: tier.unitPrice,
    totalAmount: tier.totalAmount,
  }));
}
