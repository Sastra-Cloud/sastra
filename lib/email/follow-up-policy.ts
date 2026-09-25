import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

import { segmentEmailBody } from "./body-segments";

export function latestReplyText(body: string | null | undefined): string {
  return segmentEmailBody({ text: body }).visibleText.slice(0, 4_000);
}

export function fallbackFollowUpSummary(subject: string | null | undefined) {
  const topic = (subject ?? "this email")
    .replace(/^(?:(?:re|fw|fwd)\s*:\s*)+/i, "")
    .trim();
  return `Waiting for a response about ${topic || "this email"}.`;
}

export function externalRecipient(
  recipients: readonly string[],
  internalDomains: readonly string[]
): string | null {
  const internal = new Set(
    internalDomains.map((domain) => domain.toLowerCase().replace(/^@/, ""))
  );
  return (
    recipients.find((address) => {
      const domain = address.split("@")[1]?.toLowerCase();
      return domain && !internal.has(domain);
    }) ?? null
  );
}

/** Advance in workspace-local calendar days while preserving the local time. */
export function addBusinessDaysInTimeZone(input: {
  from: Date;
  businessDays: number;
  workDays: readonly number[];
  timeZone: string;
}): Date {
  const timeZone = input.timeZone || "UTC";
  const localDate = formatInTimeZone(input.from, timeZone, "yyyy-MM-dd");
  const localTime = formatInTimeZone(input.from, timeZone, "HH:mm:ss");
  const workDays = new Set(input.workDays.length ? input.workDays : [1, 2, 3, 4, 5]);
  const cursor = new Date(`${localDate}T12:00:00Z`);
  let remaining = Math.max(1, input.businessDays);
  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (workDays.has(cursor.getUTCDay())) remaining -= 1;
  }
  const dueDate = cursor.toISOString().slice(0, 10);
  return fromZonedTime(`${dueDate}T${localTime}`, timeZone);
}

export function followUpDueAt(input: {
  dueAt: Date;
  snoozedUntil: Date | null;
}) {
  return input.snoozedUntil ?? input.dueAt;
}
