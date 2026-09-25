import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signing scheme for the generic inbound-email webhook (`POST /api/email/inbound`).
 *
 * The sender posts the raw RFC 822 message as the body and adds two headers:
 *
 *   X-Sastra-Timestamp: <unix seconds>
 *   X-Sastra-Signature: hex( HMAC-SHA256( secret, `${timestamp}.${sha256hex(body)}` ) )
 *
 * Hashing the body first keeps the signed string small for any sender and
 * means a relay can sign from a digest it already has. Pure, so a future
 * sender (Sastra Cloud's mail relay, a forwarding script) can import it.
 */

export const INBOUND_SIGNATURE_TOLERANCE_SECONDS = 5 * 60;
export const INBOUND_TIMESTAMP_HEADER = "x-sastra-timestamp";
export const INBOUND_SIGNATURE_HEADER = "x-sastra-signature";

export type InboundSignatureFailure =
  | "missing-secret"
  | "missing-headers"
  | "bad-timestamp"
  | "stale"
  | "mismatch";

export type InboundSignatureResult =
  | { ok: true }
  | { ok: false; reason: InboundSignatureFailure };

/** Lowercase hex SHA-256 of the raw body. */
export function bodyDigest(body: Buffer | string): string {
  return createHash("sha256").update(body).digest("hex");
}

/** The exact string that is HMAC-signed. */
export function inboundSigningString(timestamp: string | number, body: Buffer | string): string {
  return `${timestamp}.${bodyDigest(body)}`;
}

/** Produce the `X-Sastra-Signature` value for a body at a timestamp. */
export function signInboundMessage(input: {
  secret: string;
  timestamp: string | number;
  body: Buffer | string;
}): string {
  return createHmac("sha256", input.secret)
    .update(inboundSigningString(input.timestamp, input.body))
    .digest("hex");
}

function constantTimeHexEqual(a: string, b: string): boolean {
  if (!/^[0-9a-f]+$/i.test(a) || !/^[0-9a-f]+$/i.test(b)) return false;
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Verify the timestamp + signature headers against the raw body. `now` is
 * unix seconds and defaults to the current clock; timestamps older than the
 * tolerance (or too far in the future) are rejected before the HMAC check.
 */
export function verifyInboundSignature(input: {
  secret: string | null | undefined;
  timestamp: string | null | undefined;
  signature: string | null | undefined;
  body: Buffer | string;
  now?: number;
  toleranceSeconds?: number;
}): InboundSignatureResult {
  const secret = input.secret?.trim();
  if (!secret) return { ok: false, reason: "missing-secret" };
  const timestamp = input.timestamp?.trim();
  const signature = input.signature?.trim();
  if (!timestamp || !signature) return { ok: false, reason: "missing-headers" };
  if (!/^\d{1,12}$/.test(timestamp)) return { ok: false, reason: "bad-timestamp" };

  const now = input.now ?? Math.floor(Date.now() / 1000);
  const tolerance = input.toleranceSeconds ?? INBOUND_SIGNATURE_TOLERANCE_SECONDS;
  if (Math.abs(now - Number(timestamp)) > tolerance) {
    return { ok: false, reason: "stale" };
  }

  const expected = signInboundMessage({ secret, timestamp, body: input.body });
  return constantTimeHexEqual(signature, expected)
    ? { ok: true }
    : { ok: false, reason: "mismatch" };
}
