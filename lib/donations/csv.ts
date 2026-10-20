import { createHash } from "node:crypto";

import {
  DONATION_CSV_FIELDS,
  GIVING_PLATFORM_MAPPING,
  columnValueCounts,
  detectDateOrder,
  normalizeCsvHeader,
  type DonationCsvMapping,
} from "./csv-format";
import type { DonationCsvPreview } from "./types";

export const MAX_DONATION_CSV_BYTES = 5 * 1024 * 1024;

/** Stored status for exports without a status column: every row is received. */
export const RECEIVED_STATUS = "Received";

export type ParsedDonationRow = {
  sourceRowNumber: number;
  campaignExternalId: string | null;
  donor: string;
  donorKey: string;
  campaign: string | null;
  recurring: string | null;
  amount: number;
  amountCents: number;
  paymentMethod: string | null;
  sourceStatus: string;
  donationDate: string;
  sourceDateTime: string;
  notes: string | null;
  rowFingerprint: string;
};

export type DonationCsvResult = {
  rowCount: number;
  successfulRows: ParsedDonationRow[];
  failedRows: number;
  successfulAmount: number;
};

export type DonationCsvTable = {
  headers: string[];
  rows: string[][];
};

const SENSITIVE_DONATION_HEADERS = new Set([
  "account number",
  "bank account",
  "bank account number",
  "bic",
  "card number",
  "card verification code",
  "credit card number",
  "cvc",
  "cvv",
  "debit card number",
  "iban",
  "pan",
  "pin",
  "primary account number",
  "routing number",
  "security code",
  "social security number",
  "ssn",
  "swift",
  "tax id",
  "taxpayer identification number",
  "tin",
]);

/** A problem in the file itself, safe to show to the admin as written. */
export class DonationCsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DonationCsvError";
  }
}

export class SensitiveDonationColumnsError extends Error {
  constructor(readonly headers: string[]) {
    super("The CSV contains sensitive payment or identity columns.");
    this.name = "SensitiveDonationColumnsError";
  }
}

export function findSensitiveDonationHeaders(input: string): string[] {
  const [headerRow] = parseCsvRows(input);
  if (!headerRow) return [];
  return headerRow
    .map((header) => ({
      original: header.replace(/^\uFEFF/, "").trim(),
      normalized: normalizeCsvHeader(header),
    }))
    .filter(({ normalized }) => SENSITIVE_DONATION_HEADERS.has(normalized))
    .map(({ original }) => original);
}

export function assertSafeDonationHeaders(input: string): void {
  const sensitive = findSensitiveDonationHeaders(input);
  if (sensitive.length > 0) {
    throw new SensitiveDonationColumnsError(sensitive);
  }
}

export function normalizeDonationText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Small RFC 4180 parser that preserves quoted commas and newlines. */
export function parseCsvRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new DonationCsvError("The CSV has an unfinished quoted value.");
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((values) => values.some((value) => value.trim() !== ""));
}

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function calendarDate(year: number, month: number, day: number): string | null {
  const test = new Date(Date.UTC(year, month - 1, day));
  if (
    test.getUTCFullYear() !== year ||
    test.getUTCMonth() !== month - 1 ||
    test.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function fullYear(value: string): number {
  const year = Number(value);
  if (value.length === 4) return year;
  return year < 70 ? 2000 + year : 1900 + year;
}

/**
 * Read a gift date as YYYY-MM-DD. Accepts ISO dates, numeric dates in the
 * given order (2/14/2026, 14.02.26), and month names ("October 16, 2026",
 * "16 Oct 2026"). A trailing time is ignored.
 */
export function parseDonationDate(
  value: string,
  order: DonationCsvMapping["dateOrder"] = "mdy"
): string | null {
  const text = value.trim().replace(/\s+/g, " ");
  const yearFirst = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:$|[T\s])/.exec(text);
  if (yearFirst) {
    return calendarDate(
      Number(yearFirst[1]),
      Number(yearFirst[2]),
      Number(yearFirst[3])
    );
  }
  const numeric = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:$|[T\s,])/.exec(text);
  if (numeric) {
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    const year = fullYear(numeric[3]);
    return order === "dmy"
      ? calendarDate(year, second, first)
      : calendarDate(year, first, second);
  }
  const words = text.replace(/^(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,? /i, "");
  const monthFirst =
    /^([A-Za-z]+)\.?[ -](\d{1,2})(?:st|nd|rd|th)?,?[ -](\d{4})(?:$|[T\s,])/.exec(words);
  if (monthFirst && MONTHS[monthFirst[1].toLowerCase()]) {
    return calendarDate(
      Number(monthFirst[3]),
      MONTHS[monthFirst[1].toLowerCase()],
      Number(monthFirst[2])
    );
  }
  const dayFirst =
    /^(\d{1,2})(?:st|nd|rd|th)?[ -]([A-Za-z]+)\.?,?[ -](\d{4})(?:$|[T\s,])/.exec(words);
  if (dayFirst && MONTHS[dayFirst[2].toLowerCase()]) {
    return calendarDate(
      Number(dayFirst[3]),
      MONTHS[dayFirst[2].toLowerCase()],
      Number(dayFirst[1])
    );
  }
  return null;
}

/**
 * Read an exported amount: "$6,094.69", "USD 25", "(25.00)", "-$20",
 * "1.234,56". Returns null when the value is not a plain number.
 */
export function parseDonationAmount(value: string): number | null {
  let text = value.trim().replace(/[\s\u00a0]/g, "");
  if (!text) return null;
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  text = text
    .replace(/[$€£¥₹៛]/g, "")
    .replace(/^[A-Za-z]{2,3}/, "")
    .replace(/[A-Za-z]{2,3}$/, "");
  if (text.startsWith("-")) {
    negative = !negative;
    text = text.slice(1);
  } else if (text.startsWith("+")) {
    text = text.slice(1);
  }
  if (text.endsWith("-")) {
    negative = !negative;
    text = text.slice(0, -1);
  }
  // A comma followed by one or two final digits is a decimal comma (1.234,56).
  if (/^\d{1,3}(?:\.\d{3})*,\d{1,2}$|^\d+,\d{1,2}$/.test(text)) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(text)) {
    text = text.replace(/,/g, "");
  }
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(text)) return null;
  const amount = Number(text);
  return negative ? -amount : amount;
}

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function donationRowFingerprint(input: {
  campaignExternalId: string | null;
  donor: string;
  campaign: string | null;
  recurring: string | null;
  amountCents: number;
  paymentMethod: string | null;
  sourceStatus: string;
  sourceDateTime: string;
  notes: string | null;
}): string {
  const canonical = [
    normalizeDonationText(input.campaignExternalId ?? ""),
    normalizeDonationText(input.donor),
    normalizeDonationText(input.campaign ?? ""),
    normalizeDonationText(input.recurring ?? ""),
    String(input.amountCents),
    normalizeDonationText(input.paymentMethod ?? ""),
    normalizeDonationText(input.sourceStatus),
    input.sourceDateTime.trim().replace(/\s+/g, " "),
    normalizeDonationText(input.notes ?? ""),
  ].join("\u001f");
  return createHash("sha256").update(canonical).digest("hex");
}

export function donationFileHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/** Split a CSV into trimmed headers and data rows after the safety check. */
export function readDonationCsv(input: string): DonationCsvTable {
  assertSafeDonationHeaders(input);
  const rows = parseCsvRows(input);
  if (rows.length < 2) {
    throw new DonationCsvError("The CSV has no donation rows.");
  }
  return {
    headers: rows[0].map((header) => header.replace(/^\uFEFF/, "").trim()),
    rows: rows.slice(1),
  };
}

/** Stable identity for a header layout, independent of column order. */
export function donationCsvHeaderSignature(headers: string[]): string {
  const canonical = [...new Set(headers.map(normalizeCsvHeader))]
    .filter(Boolean)
    .sort()
    .join("\u001f");
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Parse every row with one column mapping. Rows whose status is not a
 * received value count as failed payments. Identical rows inside one file get
 * distinct fingerprints so two equal gifts on the same day are both kept;
 * later overlapping exports still match them by occurrence.
 */
export function parseDonationTable(
  table: DonationCsvTable,
  mapping: DonationCsvMapping,
  options: { currency?: string } = {}
): DonationCsvResult {
  const { headers, rows } = table;
  const columnIndex = (header: string | null) =>
    header ? headers.indexOf(header) : -1;
  const missing = DONATION_CSV_FIELDS.filter(
    ({ field, required }) =>
      required && columnIndex(mapping.columns[field]) < 0
  ).map(({ field, label }) => mapping.columns[field] ?? label);
  if (missing.length > 0) {
    throw new DonationCsvError(`The CSV is missing: ${missing.join(", ")}.`);
  }
  const indexes = Object.fromEntries(
    DONATION_CSV_FIELDS.map(({ field }) => [
      field,
      columnIndex(mapping.columns[field]),
    ])
  ) as Record<keyof DonationCsvMapping["columns"], number>;
  const value = (
    row: string[],
    field: keyof DonationCsvMapping["columns"]
  ) => {
    const index = indexes[field];
    return index < 0 ? "" : row[index] ?? "";
  };
  const received = new Set(
    mapping.successStatuses.map((status) => normalizeDonationText(status))
  );
  const expectedCurrency = options.currency?.trim().toUpperCase();

  const successfulRows: ParsedDonationRow[] = [];
  const occurrences = new Map<string, number>();
  let failedRows = 0;
  let successfulCents = 0;

  rows.forEach((row, rowIndex) => {
    const sourceRowNumber = rowIndex + 2;
    const sourceStatus =
      indexes.status < 0 ? RECEIVED_STATUS : value(row, "status").trim();
    if (
      indexes.status >= 0 &&
      !received.has(normalizeDonationText(sourceStatus))
    ) {
      failedRows += 1;
      return;
    }
    const donor = value(row, "donor").trim() || "Anonymous";
    const amount = parseDonationAmount(value(row, "amount"));
    const sourceDateTime = value(row, "date").trim();
    const donationDate = parseDonationDate(sourceDateTime, mapping.dateOrder);
    if (amount === null || !Number.isFinite(amount) || amount === 0) {
      throw new DonationCsvError(`Row ${sourceRowNumber} has an invalid amount.`);
    }
    if (!donationDate) {
      throw new DonationCsvError(`Row ${sourceRowNumber} has an invalid date.`);
    }
    const rowCurrency = value(row, "currency").trim().toUpperCase();
    if (expectedCurrency && rowCurrency && rowCurrency !== expectedCurrency) {
      throw new DonationCsvError(
        `Row ${sourceRowNumber} is in ${rowCurrency}. Sastra records donations in ${expectedCurrency}.`
      );
    }
    const amountCents = Math.round(amount * 100);
    const campaignExternalId = nullable(value(row, "campaignExternalId"));
    const campaign = nullable(value(row, "campaign"));
    const recurring = nullable(value(row, "recurring"));
    const paymentMethod = nullable(value(row, "paymentMethod"));
    const notes = nullable(value(row, "notes"));
    const baseFingerprint = donationRowFingerprint({
      campaignExternalId,
      donor,
      campaign,
      recurring,
      amountCents,
      paymentMethod,
      sourceStatus,
      sourceDateTime,
      notes,
    });
    const occurrence = (occurrences.get(baseFingerprint) ?? 0) + 1;
    occurrences.set(baseFingerprint, occurrence);
    successfulRows.push({
      sourceRowNumber,
      campaignExternalId,
      donor,
      donorKey: normalizeDonationText(donor),
      campaign,
      recurring,
      amount: amountCents / 100,
      amountCents,
      paymentMethod,
      sourceStatus,
      donationDate,
      sourceDateTime,
      notes,
      rowFingerprint:
        occurrence === 1
          ? baseFingerprint
          : createHash("sha256")
              .update(`${baseFingerprint}\u001f${occurrence}`)
              .digest("hex"),
    });
    successfulCents += amountCents;
  });

  return {
    rowCount: rows.length,
    successfulRows,
    failedRows,
    successfulAmount: successfulCents / 100,
  };
}

/** Parse a CSV; without a mapping it reads the built-in giving-platform export. */
export function parseDonationCsv(
  input: string,
  mapping: DonationCsvMapping = GIVING_PLATFORM_MAPPING,
  options: { currency?: string } = {}
): DonationCsvResult {
  return parseDonationTable(readDonationCsv(input), mapping, options);
}

/** Dry-run a mapping for the review dialog. Never throws for row problems. */
export function previewDonationTable(
  table: DonationCsvTable,
  mapping: DonationCsvMapping,
  options: { currency?: string } = {}
): DonationCsvPreview {
  const statusValues = columnValueCounts(
    table.headers,
    table.rows,
    mapping.columns.status
  ).slice(0, 20);
  const numericDates = detectDateOrder(
    columnValueCounts(table.headers, table.rows, mapping.columns.date).map(
      (item) => item.value
    )
  ).numeric;
  try {
    const parsed = parseDonationTable(table, mapping, options);
    return {
      rowCount: parsed.rowCount,
      receivedRows: parsed.successfulRows.length,
      failedRows: parsed.failedRows,
      receivedAmount: parsed.successfulAmount.toFixed(2),
      sample: parsed.successfulRows.slice(0, 5).map((row) => ({
        rowNumber: row.sourceRowNumber,
        date: row.donationDate,
        donor: row.donor,
        amount: row.amount.toFixed(2),
        campaign: row.campaign,
        status: row.sourceStatus,
      })),
      error:
        parsed.successfulRows.length === 0
          ? "No row counts as money received. Check the payment status choices."
          : null,
      statusValues,
      numericDates,
    };
  } catch (error) {
    if (!(error instanceof DonationCsvError)) throw error;
    return {
      rowCount: table.rows.length,
      receivedRows: 0,
      failedRows: 0,
      receivedAmount: "0.00",
      sample: [],
      error: error.message,
      statusValues,
      numericDates,
    };
  }
}
