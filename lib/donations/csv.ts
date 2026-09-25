import { createHash } from "node:crypto";

export const MAX_DONATION_CSV_BYTES = 5 * 1024 * 1024;

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

function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");
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
      normalized: normalizeHeader(header),
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
  if (quoted) throw new Error("The CSV has an unfinished quoted value.");
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((values) => values.some((value) => value.trim() !== ""));
}

function parseDonationDate(value: string): string | null {
  const trimmed = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(trimmed);
  if (!us) return null;
  const month = Number(us[1]);
  const day = Number(us[2]);
  const year = Number(us[3]);
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

export function parseDonationCsv(input: string): DonationCsvResult {
  assertSafeDonationHeaders(input);
  const rows = parseCsvRows(input);
  if (rows.length < 2) {
    throw new Error("The CSV has no donation rows.");
  }
  const headers = rows[0].map(normalizeHeader);
  const indexOf = (name: string) => headers.indexOf(normalizeHeader(name));
  const required = ["Donor", "Amount", "Status", "Date/Time"];
  const missing = required.filter((header) => indexOf(header) < 0);
  if (missing.length > 0) {
    throw new Error(`The CSV is missing: ${missing.join(", ")}.`);
  }
  const value = (row: string[], header: string) => {
    const index = indexOf(header);
    return index < 0 ? "" : row[index] ?? "";
  };

  const successfulRows: ParsedDonationRow[] = [];
  let failedRows = 0;
  let successfulAmount = 0;

  rows.slice(1).forEach((row, rowIndex) => {
    const sourceRowNumber = rowIndex + 2;
    const sourceStatus = value(row, "Status").trim();
    if (sourceStatus.toLowerCase() !== "success") {
      failedRows += 1;
      return;
    }
    const donor = value(row, "Donor").trim();
    const rawAmount = value(row, "Amount").replace(/[$,\s]/g, "");
    const amount = Number(rawAmount);
    const sourceDateTime = value(row, "Date/Time").trim();
    const donationDate = parseDonationDate(sourceDateTime);
    if (!donor) {
      throw new Error(`Row ${sourceRowNumber} has no donor.`);
    }
    if (!Number.isFinite(amount) || amount === 0) {
      throw new Error(`Row ${sourceRowNumber} has an invalid amount.`);
    }
    if (!donationDate) {
      throw new Error(`Row ${sourceRowNumber} has an invalid date.`);
    }
    const amountCents = Math.round(amount * 100);
    const campaignExternalId = nullable(value(row, "Campaign External Id"));
    const campaign = nullable(value(row, "Campaign"));
    const recurring = nullable(value(row, "Recurring"));
    const paymentMethod = nullable(value(row, "Payment"));
    const notes = nullable(value(row, "Notes"));
    const parsed: ParsedDonationRow = {
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
      rowFingerprint: donationRowFingerprint({
        campaignExternalId,
        donor,
        campaign,
        recurring,
        amountCents,
        paymentMethod,
        sourceStatus,
        sourceDateTime,
        notes,
      }),
    };
    successfulRows.push(parsed);
    successfulAmount += parsed.amount;
  });

  return {
    rowCount: rows.length - 1,
    successfulRows,
    failedRows,
    successfulAmount,
  };
}
