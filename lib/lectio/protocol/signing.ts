import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { IntegrationError, identifier, PROTOCOL_VERSION } from "./contract";

export type SigningIdentity = { id: string; epoch: string; keyId: string; secret: string };
export const digest = (body: string | Uint8Array) => createHash("sha256").update(body).digest("hex");
export function requestTarget(url: string) { const u = new URL(url); return u.pathname + u.search; }
export function signature(identity: SigningIdentity, method: string, target: string, body: string | Uint8Array,
  timestamp: string, requestId: string, operationId: string) {
  const message = ["sastra-lectio-v1", identity.id, identity.epoch, identity.keyId, timestamp,
    requestId, operationId, method.toUpperCase(), target, digest(body)].join("\n");
  return createHmac("sha256", Buffer.from(identity.secret, "base64url")).update(message).digest("hex");
}
export function signRequest(identity: SigningIdentity, method: string, url: string, body: string | Uint8Array,
  operationId?: string, now = Date.now()): Record<string, string> {
  const read = ["GET", "HEAD"].includes(method.toUpperCase());
  if (!read && !operationId) throw new IntegrationError("operation_required", "A mutation requires an operation ID.");
  const requestId = randomUUID(), timestamp = String(Math.floor(now / 1000));
  return { "Content-Type": "application/json", "X-Sastra-Protocol": PROTOCOL_VERSION,
    "X-Sastra-Connection": identity.id, "X-Sastra-Key-Id": identity.keyId, "X-Sastra-Timestamp": timestamp,
    "X-Sastra-Request-Id": requestId, ...(operationId ? { "Idempotency-Key": operationId } : {}),
    "X-Sastra-Signature": signature(identity, method, requestTarget(url), body, timestamp, requestId, operationId ?? "-") };
}
/** The caller must atomically persist the returned request ID before accepting work. */
export function verifyRequest(identity: SigningIdentity, request: Request, body: Uint8Array, now = Date.now()) {
  const headers = request.headers;
  if (headers.get("x-sastra-protocol") !== PROTOCOL_VERSION || headers.get("x-sastra-connection") !== identity.id ||
    headers.get("x-sastra-key-id") !== identity.keyId) throw new IntegrationError("unauthorized", "Invalid integration credentials.", 401);
  const timestamp = headers.get("x-sastra-timestamp") ?? "", requestId = identifier(headers.get("x-sastra-request-id"));
  if (!/^\d{10,12}$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300) {
    throw new IntegrationError("stale_request", "Request timestamp is outside the allowed window.", 401);
  }
  const read = ["GET", "HEAD"].includes(request.method);
  const operationId = read ? "-" : identifier(headers.get("idempotency-key"));
  const actual = headers.get("x-sastra-signature") ?? "";
  const expected = signature(identity, request.method, requestTarget(request.url), body, timestamp, requestId, operationId);
  if (!/^[a-f0-9]{64}$/.test(actual) || !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) {
    throw new IntegrationError("unauthorized", "Invalid integration credentials.", 401);
  }
  return { requestId, operationId: read ? null : operationId,
    fingerprint: digest(`${request.method}\n${requestTarget(request.url)}\n${digest(body)}`) };
}

export async function readLimitedBody(request: Request, limit: number): Promise<Uint8Array> {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = []; let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) { await reader.cancel(); throw new IntegrationError("payload_too_large", "Integration payload is too large.", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}

export function errorResponse(error: unknown): Response {
  if (error instanceof IntegrationError) return Response.json({ error: error.code, message: error.message }, { status: error.status });
  return Response.json({ error: "temporarily_unavailable", message: "The integration could not complete this request. Retry shortly." }, { status: 503 });
}

/** Stable wire bytes when an outbox JSONB round-trip changes object key order. */
export function canonicalJson(value: unknown): string {
  const normalize = (v: unknown): unknown => Array.isArray(v) ? v.map(normalize) :
    v !== null && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, item]) => [k, normalize(item)])) : v;
  return JSON.stringify(normalize(JSON.parse(JSON.stringify(value))));
}
