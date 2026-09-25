import { NextResponse } from "next/server";

import {
  fetchResendRawMessage,
  parseResendEvent,
  receivedEmailId,
  verifySvixSignature,
} from "@/lib/email/resend-webhook";
import { ingestRawMessage, MAX_RAW_MESSAGE_BYTES } from "@/lib/gmail";

// mailparser + AWS SDK downstream → Node runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
/** Webhook bodies are metadata only; anything larger is not a Resend event. */
const MAX_EVENT_BYTES = 256 * 1024;
/** Whole fetch-and-ingest step must finish inside Resend's delivery window. */
const FETCH_TIMEOUT_MS = 30_000;

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/**
 * Resend receiving webhook. Verifies the Svix-style signature with
 * `RESEND_WEBHOOK_SECRET`, then on `email.received` downloads the original
 * `.eml` through Resend's API (`RESEND_API_KEY`) and runs it through the same
 * ingest pipeline as IMAP. Other event types are acknowledged and ignored.
 */
export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) return json({ error: "Unauthorized" }, 401);
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_EVENT_BYTES) return json({ error: "Event too large." }, 413);

  const body = await request.text();
  if (body.length > MAX_EVENT_BYTES) return json({ error: "Event too large." }, 413);

  const verified = verifySvixSignature({
    secret,
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
    body,
  });
  if (!verified.ok) return json({ error: "Unauthorized", reason: verified.reason }, 401);

  const event = parseResendEvent(body);
  if (!event) return json({ error: "Invalid event." }, 400);
  const emailId = receivedEmailId(event);
  if (!emailId) return json({ ok: true, ignored: event.type });

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.error("Resend inbound webhook received but RESEND_API_KEY is not set.");
    return json({ ok: false, error: "resend-api-key-missing" }, 500);
  }

  try {
    const { raw } = await fetchResendRawMessage(emailId, {
      apiKey,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      maxBytes: MAX_RAW_MESSAGE_BYTES,
    });
    const result = await ingestRawMessage(raw, { source: "resend" });
    if (result.status === "duplicate") {
      return json({ ok: true, duplicate: true, messageId: result.messageId });
    }
    return json({ ok: true, event: result.event, messageId: result.messageId });
  } catch (err) {
    console.error("Resend inbound webhook ingest failed:", emailId, err);
    return json({ ok: false, error: "ingest-failed" }, 500);
  }
}
