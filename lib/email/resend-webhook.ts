import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Resend inbound-email webhooks, without the Svix SDK.
 *
 * Resend signs webhooks the Svix way: the secret is `whsec_<base64>`, the
 * signed content is `${svix-id}.${svix-timestamp}.${rawBody}`, and
 * `svix-signature` carries one or more space-separated `v1,<base64 hmac>`
 * entries (several during a secret rotation). The webhook body only carries
 * metadata; the message itself comes from the Received Emails API, which
 * returns a short-lived signed link to the original `.eml`.
 */

export const RESEND_SIGNATURE_TOLERANCE_SECONDS = 5 * 60;
export const RESEND_API_BASE_URL = "https://api.resend.com";

export type SvixVerifyFailure =
  | "missing-secret"
  | "bad-secret"
  | "missing-headers"
  | "bad-timestamp"
  | "stale"
  | "mismatch";

export type SvixVerifyResult =
  | { ok: true }
  | { ok: false; reason: SvixVerifyFailure };

/** Decode a `whsec_…` (or bare base64) signing secret into key bytes. */
export function decodeSvixSecret(secret: string): Buffer | null {
  const trimmed = secret.trim();
  const encoded = trimmed.startsWith("whsec_") ? trimmed.slice("whsec_".length) : trimmed;
  if (!encoded) return null;
  const key = Buffer.from(encoded, "base64");
  return key.length ? key : null;
}

export function svixSigningString(id: string, timestamp: string | number, body: string): string {
  return `${id}.${timestamp}.${body}`;
}

/** Produce a `v1,<sig>` entry the way Svix does — used by tests and local senders. */
export function signSvix(input: {
  secret: string;
  id: string;
  timestamp: string | number;
  body: string;
}): string {
  const key = decodeSvixSecret(input.secret);
  if (!key) throw new Error("Invalid Svix secret.");
  const digest = createHmac("sha256", key)
    .update(svixSigningString(input.id, input.timestamp, input.body))
    .digest("base64");
  return `v1,${digest}`;
}

function constantTimeBase64Equal(a: string, b: string): boolean {
  const left = Buffer.from(a, "base64");
  const right = Buffer.from(b, "base64");
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right);
}

export function verifySvixSignature(input: {
  secret: string | null | undefined;
  id: string | null | undefined;
  timestamp: string | null | undefined;
  signature: string | null | undefined;
  body: string;
  now?: number;
  toleranceSeconds?: number;
}): SvixVerifyResult {
  if (!input.secret?.trim()) return { ok: false, reason: "missing-secret" };
  const key = decodeSvixSecret(input.secret);
  if (!key) return { ok: false, reason: "bad-secret" };

  const id = input.id?.trim();
  const timestamp = input.timestamp?.trim();
  const signatureHeader = input.signature?.trim();
  if (!id || !timestamp || !signatureHeader) {
    return { ok: false, reason: "missing-headers" };
  }
  if (!/^\d{1,12}$/.test(timestamp)) return { ok: false, reason: "bad-timestamp" };

  const now = input.now ?? Math.floor(Date.now() / 1000);
  const tolerance = input.toleranceSeconds ?? RESEND_SIGNATURE_TOLERANCE_SECONDS;
  if (Math.abs(now - Number(timestamp)) > tolerance) {
    return { ok: false, reason: "stale" };
  }

  const expected = createHmac("sha256", key)
    .update(svixSigningString(id, timestamp, input.body))
    .digest("base64");
  const candidates = signatureHeader
    .split(/\s+/)
    .map((entry) => entry.split(",", 2))
    .filter(([version, value]) => version === "v1" && !!value)
    .map(([, value]) => value);
  return candidates.some((candidate) => constantTimeBase64Equal(candidate, expected))
    ? { ok: true }
    : { ok: false, reason: "mismatch" };
}

/** The `email.received` webhook event (other event types are ignored). */
export type ResendWebhookEvent = {
  type: string;
  created_at?: string;
  data?: {
    email_id?: string;
    message_id?: string;
    from?: string;
    to?: string[];
    subject?: string;
  };
};

/** Parse a webhook body; null when it is not a JSON object with a `type`. */
export function parseResendEvent(body: string): ResendWebhookEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const event = parsed as Record<string, unknown>;
  if (typeof event.type !== "string") return null;
  const data =
    event.data && typeof event.data === "object"
      ? (event.data as ResendWebhookEvent["data"])
      : undefined;
  return { type: event.type, created_at: String(event.created_at ?? ""), data };
}

/** Whether an event is a received email whose `.eml` can be fetched. */
export function receivedEmailId(event: ResendWebhookEvent): string | null {
  if (event.type !== "email.received") return null;
  const id = event.data?.email_id?.trim();
  return id && /^[A-Za-z0-9-]{1,80}$/.test(id) ? id : null;
}

export type ResendRawMessage = {
  raw: Buffer;
  messageId: string | null;
};

/**
 * Fetch one received email's original `.eml` through
 * `GET /emails/receiving/{id}` and its signed `raw.download_url` link.
 * Both requests share one abort signal so the whole step stays bounded.
 */
export async function fetchResendRawMessage(
  emailId: string,
  options: {
    apiKey: string;
    fetchImpl?: typeof fetch;
    baseUrl?: string;
    signal?: AbortSignal;
    maxBytes?: number;
  }
): Promise<ResendRawMessage> {
  const doFetch = options.fetchImpl ?? fetch;
  const base = options.baseUrl ?? RESEND_API_BASE_URL;
  const meta = await doFetch(`${base}/emails/receiving/${encodeURIComponent(emailId)}`, {
    headers: { Authorization: `Bearer ${options.apiKey}` },
    signal: options.signal,
  });
  if (!meta.ok) {
    throw new Error(`Resend received-email lookup failed (HTTP ${meta.status}).`);
  }
  const body = (await meta.json()) as {
    message_id?: string;
    raw?: { download_url?: string };
  };
  const downloadUrl = body.raw?.download_url;
  if (!downloadUrl || !/^https:\/\//.test(downloadUrl)) {
    throw new Error("Resend did not return a raw download link for the email.");
  }
  const download = await doFetch(downloadUrl, { signal: options.signal });
  if (!download.ok) {
    throw new Error(`Resend raw email download failed (HTTP ${download.status}).`);
  }
  const raw = Buffer.from(await download.arrayBuffer());
  if (options.maxBytes && raw.byteLength > options.maxBytes) {
    throw new Error("Resend raw email exceeds the accepted size.");
  }
  return { raw, messageId: body.message_id?.trim() || null };
}
