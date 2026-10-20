/**
 * Column mapping for donation CSV exports. Pure and client-safe: the review
 * dialog uses the field list, and the server uses the detection helpers.
 */
import type {
  DonationCsvField,
  DonationCsvMapping,
} from "@/lib/db/schema/donations";

export type { DonationCsvField, DonationCsvMapping };

export const DONATION_CSV_FIELDS: Array<{
  field: DonationCsvField;
  label: string;
  required: boolean;
  hint?: string;
}> = [
  { field: "date", label: "Gift date", required: true },
  { field: "donor", label: "Donor", required: true },
  { field: "amount", label: "Amount", required: true },
  {
    field: "status",
    label: "Payment status",
    required: false,
    hint: "Leave empty when every row is money received.",
  },
  {
    field: "currency",
    label: "Currency",
    required: false,
    hint: "Every row must use the workspace currency.",
  },
  { field: "campaign", label: "Campaign or fund", required: false },
  { field: "campaignExternalId", label: "Campaign ID", required: false },
  { field: "recurring", label: "Recurring", required: false },
  { field: "paymentMethod", label: "Payment type", required: false },
  { field: "notes", label: "Donor note", required: false },
];

export const REQUIRED_DONATION_CSV_FIELDS = DONATION_CSV_FIELDS.filter(
  (item) => item.required
).map((item) => item.field);

export function normalizeCsvHeader(value: string): string {
  return value
    .replace(/^﻿/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function emptyDonationCsvMapping(): DonationCsvMapping {
  return {
    columns: {
      date: null,
      donor: null,
      amount: null,
      status: null,
      currency: null,
      campaign: null,
      campaignExternalId: null,
      recurring: null,
      paymentMethod: null,
      notes: null,
    },
    successStatuses: [],
    dateOrder: "mdy",
  };
}

/** The original giving-platform export, always recognized without review. */
export const GIVING_PLATFORM_MAPPING: DonationCsvMapping = {
  columns: {
    date: "Date/Time",
    donor: "Donor",
    amount: "Amount",
    status: "Status",
    currency: null,
    campaign: "Campaign",
    campaignExternalId: "Campaign External Id",
    recurring: "Recurring",
    paymentMethod: "Payment",
    notes: "Notes",
  },
  successStatuses: ["Success"],
  dateOrder: "mdy",
};

export function isGivingPlatformExport(headers: string[]): boolean {
  const present = new Set(headers.map(normalizeCsvHeader));
  return ["donor", "amount", "status", "date time"].every((header) =>
    present.has(header)
  );
}

/** Status words that clearly mean a completed payment. */
const KNOWN_SUCCESS_STATUSES = new Set([
  "success",
  "succeeded",
  "successful",
  "complete",
  "completed",
  "paid",
  "settled",
  "approved",
  "received",
  "posted",
  "processed",
  "captured",
  "cleared",
  "deposited",
]);

export function isKnownSuccessStatus(value: string): boolean {
  return KNOWN_SUCCESS_STATUSES.has(normalizeCsvHeader(value));
}

/** Header aliases in priority order. Matching uses `normalizeCsvHeader`. */
const HEADER_ALIASES: Record<DonationCsvField, string[]> = {
  date: [
    "date time",
    "date",
    "gift date",
    "donation date",
    "transaction date",
    "payment date",
    "received date",
    "date received",
    "deposit date",
    "posted date",
    "processed date",
    "created",
    "created at",
    "created date",
  ],
  donor: [
    "donor",
    "donor name",
    "name",
    "full name",
    "giver",
    "giver name",
    "contributor",
    "contributor name",
    "supporter",
    "supporter name",
    "constituent",
    "constituent name",
    "customer",
    "customer name",
    "payer",
    "payer name",
  ],
  amount: [
    "amount",
    "gift amount",
    "donation amount",
    "contribution amount",
    "payment amount",
    "transaction amount",
    "gross amount",
    "gross",
    "total",
    "total amount",
  ],
  status: [
    "status",
    "payment status",
    "transaction status",
    "gift status",
    "donation status",
    "state",
  ],
  currency: ["currency", "currency code", "gift currency"],
  campaign: [
    "campaign",
    "campaign name",
    "fund",
    "fund name",
    "designation",
    "designation name",
    "appeal",
    "appeal name",
    "purpose",
    "program",
  ],
  campaignExternalId: [
    "campaign external id",
    "campaign id",
    "campaign code",
    "fund id",
    "fund code",
    "designation id",
    "designation code",
    "appeal code",
  ],
  recurring: [
    "recurring",
    "is recurring",
    "recurring gift",
    "frequency",
    "gift frequency",
    "recurrence",
  ],
  paymentMethod: [
    "payment",
    "payment method",
    "payment type",
    "method",
    "contribution type",
    "gift type",
    "donation type",
    "tender type",
    "channel",
  ],
  notes: [
    "notes",
    "note",
    "donor comments",
    "donor comment",
    "comments",
    "comment",
    "memo",
    "message",
    "donor note",
    "donor message",
    "tribute",
  ],
};

export type DonationCsvSuggestion = {
  mapping: DonationCsvMapping;
  /** Required fields the header rules could not find. */
  missingRequired: DonationCsvField[];
};

/** Distinct non-empty values in one column, most common first. */
export function columnValueCounts(
  headers: string[],
  rows: string[][],
  header: string | null
): Array<{ value: string; count: number }> {
  if (!header) return [];
  const index = headers.indexOf(header);
  if (index < 0) return [];
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = (row[index] ?? "").trim();
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

const NUMERIC_DATE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:$|[T\s,])/;

/** Whether a column holds numeric dates, and which order its values prove. */
export function detectDateOrder(values: string[]): {
  numeric: boolean;
  order: "mdy" | "dmy";
} {
  let numeric = false;
  let dayFirst = false;
  let monthFirst = false;
  for (const value of values) {
    const match = NUMERIC_DATE.exec(value.trim());
    if (!match) continue;
    numeric = true;
    if (Number(match[1]) > 12) dayFirst = true;
    if (Number(match[2]) > 12) monthFirst = true;
  }
  return { numeric, order: dayFirst && !monthFirst ? "dmy" : "mdy" };
}

/** Default received statuses for a status column: the clearly successful values. */
export function defaultSuccessStatuses(
  headers: string[],
  rows: string[][],
  statusHeader: string | null
): string[] {
  return columnValueCounts(headers, rows, statusHeader)
    .map((item) => item.value)
    .filter(isKnownSuccessStatus);
}

/** Header-rule guess for an unfamiliar export. The admin always reviews it. */
export function suggestDonationCsvMapping(
  headers: string[],
  rows: string[][]
): DonationCsvSuggestion {
  const mapping = emptyDonationCsvMapping();
  const normalized = headers.map(normalizeCsvHeader);
  const used = new Set<number>();

  for (const { field } of DONATION_CSV_FIELDS) {
    for (const alias of HEADER_ALIASES[field]) {
      const index = normalized.findIndex(
        (header, position) => header === alias && !used.has(position)
      );
      if (index >= 0) {
        mapping.columns[field] = headers[index];
        used.add(index);
        break;
      }
    }
  }

  mapping.successStatuses = defaultSuccessStatuses(
    headers,
    rows,
    mapping.columns.status
  );
  mapping.dateOrder = detectDateOrder(
    columnValueCounts(headers, rows, mapping.columns.date).map(
      (item) => item.value
    )
  ).order;

  return {
    mapping,
    missingRequired: REQUIRED_DONATION_CSV_FIELDS.filter(
      (field) => !mapping.columns[field]
    ),
  };
}

/** Problems that stop a mapping from being used, in plain language. */
export function donationCsvMappingProblems(
  headers: string[],
  mapping: DonationCsvMapping
): string[] {
  const problems: string[] = [];
  for (const { field, label, required } of DONATION_CSV_FIELDS) {
    const header = mapping.columns[field];
    if (!header) {
      if (required) problems.push(`Choose the column for ${label}.`);
      continue;
    }
    if (!headers.includes(header)) {
      problems.push(`The CSV has no column named "${header}".`);
    }
  }
  const required = REQUIRED_DONATION_CSV_FIELDS.map(
    (field) => mapping.columns[field]
  ).filter(Boolean);
  if (new Set(required).size !== required.length) {
    problems.push("Gift date, Donor, and Amount must use different columns.");
  }
  return problems;
}

/** A readable default name, e.g. "Donation Detail Fund Manager Download". */
export function formatNameFromFilename(filename: string): string {
  const base = filename
    .replace(/\.csv$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\d{6,}\b/g, " ")
    .replace(/\b\d{4}[ .]\d{1,2}[ .]\d{1,2}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (base || "Donation CSV").slice(0, 80);
}

const MONTH_WORDS = [
  "jan",
  "january",
  "feb",
  "february",
  "mar",
  "march",
  "apr",
  "april",
  "may",
  "jun",
  "june",
  "jul",
  "july",
  "aug",
  "august",
  "sep",
  "sept",
  "september",
  "oct",
  "october",
  "nov",
  "november",
  "dec",
  "december",
  "mon",
  "monday",
  "tue",
  "tuesday",
  "wed",
  "wednesday",
  "thu",
  "thursday",
  "fri",
  "friday",
  "sat",
  "saturday",
  "sun",
  "sunday",
];
const SHAPE_KEEP_WORDS = new Set([
  ...MONTH_WORDS,
  "am",
  "pm",
  "utc",
  "gmt",
  "usd",
  "eur",
  "gbp",
  "cad",
  "aud",
  "nzd",
  "chf",
  "jpy",
  "sgd",
  "hkd",
  "thb",
  "khr",
  "true",
  "false",
  "yes",
  "no",
]);

/**
 * Mask a value to its pattern so AI can tell a date from an amount without
 * seeing donor details: "October 16, 2026" → "October 99, 9999",
 * "jordan@example.com" → "aaaaaa@aaaaaaa.aaa".
 */
export function donationValueShape(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 40)
    .replace(/[A-Za-z]+/g, (word) =>
      SHAPE_KEEP_WORDS.has(word.toLowerCase())
        ? word
        : word.replace(/[A-Z]/g, "A").replace(/[a-z]/g, "a")
    )
    .replace(/\d/g, "9");
}

const PERSONAL_HEADER =
  /name|donor|giver|contributor|supporter|constituent|customer|payer|address|street|city|state|province|zip|postal|country|email|e mail|phone|mobile|contact|comment|note|memo|message|description|tribute|employer|first|last|company|organization|organisation/;

export type DonationCsvColumnProfile = {
  header: string;
  filled: number;
  shapes: string[];
  /** Real values, only for short repeated codes such as statuses. */
  values: string[] | null;
};

/**
 * What AI may see about each column: header text, masked value patterns, and
 * real values only for short repeated codes in non-personal columns.
 */
export function donationCsvColumnProfiles(
  headers: string[],
  rows: string[][]
): DonationCsvColumnProfile[] {
  return headers.map((header) => {
    const counts = columnValueCounts(headers, rows, header);
    const filled = counts.reduce((sum, item) => sum + item.count, 0);
    const shapes = [
      ...new Set(counts.map((item) => donationValueShape(item.value))),
    ].slice(0, 3);
    const safeCodes =
      !PERSONAL_HEADER.test(normalizeCsvHeader(header)) &&
      counts.length > 0 &&
      counts.length <= 8 &&
      filled >= counts.length * 2 &&
      counts.every(
        (item) =>
          item.value.length <= 30 &&
          !item.value.includes("@") &&
          !/\d{3,}/.test(item.value)
      );
    return {
      header,
      filled,
      shapes,
      values: safeCodes ? counts.map((item) => item.value) : null,
    };
  });
}
