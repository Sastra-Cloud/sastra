import "server-only";

import { aiStructuredFromDocument } from "@/lib/ai/openrouter";
import { donationCsvColumnProfiles, type DonationCsvMapping } from "./csv-format";
import {
  DONATION_CSV_FORMAT_JSON_SCHEMA,
  DONATION_CSV_FORMAT_SYSTEM_PROMPT,
  DONATION_CSV_FORMAT_TASK_KEY,
  normalizeAiDonationCsvMapping,
} from "./csv-format-schema";

/**
 * Ask AI which column holds each donation field. The prompt carries headers
 * and masked value patterns only — no donor names, contacts, or notes — and
 * always uses a zero-retention provider route.
 */
export async function suggestDonationCsvMappingWithAi(input: {
  headers: string[];
  rows: string[][];
  actorUserId: string;
}): Promise<{ mapping: DonationCsvMapping; name: string | null } | null> {
  const profiles = donationCsvColumnProfiles(input.headers, input.rows);
  const { data } = await aiStructuredFromDocument(
    DONATION_CSV_FORMAT_TASK_KEY,
    DONATION_CSV_FORMAT_SYSTEM_PROMPT,
    [
      {
        type: "text",
        text: JSON.stringify({ rowCount: input.rows.length, columns: profiles }),
      },
    ],
    { name: "donation_csv_format", schema: DONATION_CSV_FORMAT_JSON_SCHEMA },
    {
      strictPrivacy: true,
      timeoutMs: 60_000,
      metering: {
        scope: "workspace",
        feature: "donations",
        operation: "suggest_csv_format",
        taskKey: DONATION_CSV_FORMAT_TASK_KEY,
        actorUserId: input.actorUserId,
        entityType: "donation_csv_format",
      },
    }
  );
  return normalizeAiDonationCsvMapping(input.headers, input.rows, data);
}
