import { NextResponse } from "next/server";

import {
  INBOUND_SIGNATURE_HEADER,
  INBOUND_TIMESTAMP_HEADER,
  verifyInboundSignature,
} from "@/lib/email/inbound-signature";
import { ingestRawMessage, MAX_RAW_MESSAGE_BYTES } from "@/lib/gmail";
import { ObjectTooLargeError, readBodyBounded } from "@/lib/r2";

// mailparser + AWS SDK downstream → Node runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const ACCEPTED_TYPES = new Set(["message/rfc822", "application/octet-stream"]);

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/**
 * Generic inbound-email webhook: the body is one raw RFC 822 message, signed
 * with `INBOUND_WEBHOOK_SECRET` (see `lib/email/inbound-signature.ts`). Any
 * relay that can deliver `.eml` bytes over HTTPS — Sastra Cloud's mail relay,
 * a forwarding script — can feed the same ingest pipeline the IMAP poller uses.
 */
export async function POST(request: Request) {
  const secret = process.env.INBOUND_WEBHOOK_SECRET?.trim();
  if (!secret) return json({ error: "Unauthorized" }, 401);

  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType && !ACCEPTED_TYPES.has(contentType)) {
    return json({ error: "Send the raw email as message/rfc822." }, 400);
  }
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_RAW_MESSAGE_BYTES) return json({ error: "Message too large." }, 413);

  let body: Buffer;
  try {
    body = request.body
      ? await readBodyBounded(
          request.body as unknown as AsyncIterable<Uint8Array>,
          MAX_RAW_MESSAGE_BYTES
        )
      : Buffer.alloc(0);
  } catch (err) {
    if (err instanceof ObjectTooLargeError) return json({ error: "Message too large." }, 413);
    return json({ error: "Could not read the message body." }, 400);
  }

  const verified = verifyInboundSignature({
    secret,
    timestamp: request.headers.get(INBOUND_TIMESTAMP_HEADER),
    signature: request.headers.get(INBOUND_SIGNATURE_HEADER),
    body,
  });
  if (!verified.ok) return json({ error: "Unauthorized", reason: verified.reason }, 401);
  if (!body.byteLength) return json({ error: "Empty message body." }, 400);

  try {
    const result = await ingestRawMessage(body, { source: "webhook" });
    if (result.status === "duplicate") {
      return json({ ok: true, duplicate: true, messageId: result.messageId });
    }
    return json({ ok: true, event: result.event, messageId: result.messageId });
  } catch (err) {
    console.error("inbound email webhook ingest failed:", err);
    return json({ ok: false, error: "ingest-failed" }, 500);
  }
}
