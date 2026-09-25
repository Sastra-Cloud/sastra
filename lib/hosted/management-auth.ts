/**
 * Request signing for the control plane's management calls. Pure so it can be
 * unit tested and reused by the sender:
 *
 *   signature = HMAC-SHA256(secret, `${timestamp}.${eventId}.${sha256(body)}`)
 *
 * sent as hex in `X-Sastra-Signature`, with `X-Sastra-Timestamp` (unix seconds)
 * and `X-Sastra-Event-Id`. Stale timestamps and mismatched signatures are
 * rejected here; replayed event ids are rejected by the caller against the
 * events table.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const MANAGEMENT_HEADERS = {
  timestamp: "x-sastra-timestamp",
  eventId: "x-sastra-event-id",
  signature: "x-sastra-signature",
} as const;

export const MANAGEMENT_MAX_SKEW_SECONDS = 5 * 60;

export function bodyDigest(body: string | Uint8Array): string {
  return createHash("sha256").update(body).digest("hex");
}

export function signManagementRequest(
  secret: string,
  timestamp: number,
  eventId: string,
  body: string | Uint8Array
): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${eventId}.${bodyDigest(body)}`)
    .digest("hex");
}

export type ManagementVerification =
  | { ok: true; timestamp: number; eventId: string }
  | { ok: false; reason: "missing" | "stale" | "invalid" };

export function verifyManagementRequest(input: {
  secret: string;
  headers: { get(name: string): string | null };
  body: string | Uint8Array;
  now?: number;
}): ManagementVerification {
  const timestampRaw = input.headers.get(MANAGEMENT_HEADERS.timestamp);
  const eventId = input.headers.get(MANAGEMENT_HEADERS.eventId) ?? "";
  const signature = input.headers.get(MANAGEMENT_HEADERS.signature) ?? "";
  if (!timestampRaw || !eventId || !signature) return { ok: false, reason: "missing" };
  const timestamp = Number(timestampRaw);
  if (!Number.isInteger(timestamp)) return { ok: false, reason: "invalid" };
  const now = input.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > MANAGEMENT_MAX_SKEW_SECONDS) return { ok: false, reason: "stale" };

  const expected = Buffer.from(signManagementRequest(input.secret, timestamp, eventId, input.body), "utf8");
  const actual = Buffer.from(signature, "utf8");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, reason: "invalid" };
  }
  return { ok: true, timestamp, eventId };
}
