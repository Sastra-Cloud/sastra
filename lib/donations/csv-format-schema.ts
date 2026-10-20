/**
 * Prompt, JSON schema, and reply normalization for AI donation CSV mapping.
 * Pure module so the prompt registry and tests can import it.
 */
import { z } from "zod";

import {
  DONATION_CSV_FIELDS,
  columnValueCounts,
  defaultSuccessStatuses,
  detectDateOrder,
  emptyDonationCsvMapping,
  type DonationCsvField,
  type DonationCsvMapping,
} from "./csv-format";

export const DONATION_CSV_FORMAT_TASK_KEY = "donation_csv_format";

export const DONATION_CSV_FORMAT_SYSTEM_PROMPT = [
  "You map the columns of a donation export CSV from a giving platform or mission fund manager onto a fixed set of donation fields.",
  "You receive each column header, how many rows have a value, masked value patterns, and real values only for short repeated codes.",
  "In patterns, A is an uppercase letter, a is a lowercase letter, and 9 is a digit. Month names, weekday names, and currency codes are kept.",
  "Fields: date = the day the gift was made or received. donor = the giver's display name (person or organization), never an address, email, or phone column.",
  "amount = the money for this one gift. Never choose a running total, a fund or segment total, a count, a fee, or a net-after-fees column when a gift amount exists.",
  "status = a payment outcome column (for example Success, Failed, Refunded). Use null when no such column exists; payment channel columns such as Online/Offline/Recurring are not status.",
  "currency = a currency code column. campaign = the campaign, fund, appeal, or designation name. campaignExternalId = a separate campaign or fund code column.",
  "recurring = a frequency or recurring flag column. paymentMethod = how the gift was paid or its channel (card, ACH, check, Online, Offline); a column that mixes channels with Recurring is paymentMethod, not recurring. notes = the donor's comment or memo.",
  "Use the exact header text. Use null for a field with no matching column. Never use one column for two of date, donor, and amount.",
  "successStatuses lists the status values that mean money was actually received; use only values you were shown, and an empty list when status is null.",
  "formatName is a short plain name for this export layout, at most 6 words, without dates or numbers, such as 'Fund manager donation detail'.",
].join(" ");

const nullableString = { type: ["string", "null"] } as const;

const FIELD_KEYS = DONATION_CSV_FIELDS.map((item) => item.field);

export const DONATION_CSV_FORMAT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [...FIELD_KEYS, "successStatuses", "formatName"],
  properties: {
    ...Object.fromEntries(FIELD_KEYS.map((field) => [field, nullableString])),
    successStatuses: { type: "array", items: { type: "string" } },
    formatName: { type: "string" },
  },
} as const;

const aiReply = z.object({
  date: z.string().nullable(),
  donor: z.string().nullable(),
  amount: z.string().nullable(),
  status: z.string().nullable(),
  currency: z.string().nullable(),
  campaign: z.string().nullable(),
  campaignExternalId: z.string().nullable(),
  recurring: z.string().nullable(),
  paymentMethod: z.string().nullable(),
  notes: z.string().nullable(),
  successStatuses: z.array(z.string()).max(50),
  formatName: z.string(),
});

/**
 * Keep only what the file can support: real headers, distinct required
 * columns, and status values that actually occur.
 */
export function normalizeAiDonationCsvMapping(
  headers: string[],
  rows: string[][],
  raw: unknown
): { mapping: DonationCsvMapping; name: string | null } | null {
  const parsed = aiReply.safeParse(raw);
  if (!parsed.success) return null;
  const reply = parsed.data;
  const mapping = emptyDonationCsvMapping();
  const required = new Set<string>();
  for (const { field, required: isRequired } of DONATION_CSV_FIELDS) {
    const header = reply[field as DonationCsvField];
    if (!header || !headers.includes(header)) continue;
    if (isRequired) {
      if (required.has(header)) continue;
      required.add(header);
    }
    mapping.columns[field] = header;
  }

  const statusValues = columnValueCounts(headers, rows, mapping.columns.status).map(
    (item) => item.value
  );
  const suggested = reply.successStatuses.filter((value) =>
    statusValues.includes(value)
  );
  mapping.successStatuses = suggested.length
    ? suggested
    : defaultSuccessStatuses(headers, rows, mapping.columns.status);

  // AI sees masked digits only, so the date order comes from the real values.
  mapping.dateOrder = detectDateOrder(
    columnValueCounts(headers, rows, mapping.columns.date).map((item) => item.value)
  ).order;

  const name = reply.formatName.replace(/\s+/g, " ").trim().slice(0, 80);
  return { mapping, name: name || null };
}
