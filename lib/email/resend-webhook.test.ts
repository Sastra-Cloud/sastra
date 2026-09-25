import { describe, expect, it, vi } from "vitest";

import {
  decodeSvixSecret,
  fetchResendRawMessage,
  parseResendEvent,
  receivedEmailId,
  signSvix,
  verifySvixSignature,
} from "./resend-webhook";

const secret = `whsec_${Buffer.from("resend-signing-key-0123456789").toString("base64")}`;
const id = "msg_2abc";
const now = 1_800_000_000;
const body = JSON.stringify({
  type: "email.received",
  created_at: "2026-09-24T01:02:03.000Z",
  data: { email_id: "56761188-7520-42d8-8898-ff6fc54ce618", message_id: "<x@example.org>" },
});

describe("Svix-style signature verification", () => {
  it("decodes a whsec_ secret (and a bare base64 one)", () => {
    expect(decodeSvixSecret(secret)?.toString()).toBe("resend-signing-key-0123456789");
    expect(decodeSvixSecret(secret.slice("whsec_".length))?.toString()).toBe(
      "resend-signing-key-0123456789"
    );
    expect(decodeSvixSecret("whsec_")).toBeNull();
  });

  it("accepts a fresh v1 signature over `${id}.${timestamp}.${body}`", () => {
    const signature = signSvix({ secret, id, timestamp: now, body });
    expect(signature).toMatch(/^v1,[A-Za-z0-9+/=]+$/);
    expect(
      verifySvixSignature({ secret, id, timestamp: String(now), signature, body, now: now + 10 })
    ).toEqual({ ok: true });
  });

  it("accepts any matching entry in a space-separated list and ignores unknown versions", () => {
    const good = signSvix({ secret, id, timestamp: now, body });
    const rotated = signSvix({ secret: "whsec_b2xkLWtleQ==", id, timestamp: now, body });
    expect(
      verifySvixSignature({
        secret,
        id,
        timestamp: String(now),
        signature: `${rotated} v2,abc ${good}`,
        body,
        now,
      })
    ).toEqual({ ok: true });
    expect(
      verifySvixSignature({ secret, id, timestamp: String(now), signature: rotated, body, now })
    ).toEqual({ ok: false, reason: "mismatch" });
  });

  it("rejects missing secret/headers, stale timestamps, and tampered bodies", () => {
    const signature = signSvix({ secret, id, timestamp: now, body });
    expect(
      verifySvixSignature({ secret: undefined, id, timestamp: String(now), signature, body, now })
    ).toEqual({ ok: false, reason: "missing-secret" });
    expect(
      verifySvixSignature({ secret, id: null, timestamp: String(now), signature, body, now })
    ).toEqual({ ok: false, reason: "missing-headers" });
    expect(
      verifySvixSignature({ secret, id, timestamp: String(now), signature, body, now: now + 301 })
    ).toEqual({ ok: false, reason: "stale" });
    expect(
      verifySvixSignature({
        secret,
        id,
        timestamp: String(now),
        signature,
        body: body + " ",
        now,
      })
    ).toEqual({ ok: false, reason: "mismatch" });
    expect(
      verifySvixSignature({ secret, id, timestamp: "soon", signature, body, now })
    ).toEqual({ ok: false, reason: "bad-timestamp" });
  });
});

describe("Resend event parsing", () => {
  it("extracts the received email id only for email.received", () => {
    const event = parseResendEvent(body);
    expect(event?.type).toBe("email.received");
    expect(receivedEmailId(event!)).toBe("56761188-7520-42d8-8898-ff6fc54ce618");
    expect(
      receivedEmailId(parseResendEvent(JSON.stringify({ type: "email.sent", data: { email_id: "x" } }))!)
    ).toBeNull();
    expect(
      receivedEmailId(parseResendEvent(JSON.stringify({ type: "email.received", data: { email_id: "../x" } }))!)
    ).toBeNull();
  });

  it("returns null for non-JSON or shapeless bodies", () => {
    expect(parseResendEvent("nope")).toBeNull();
    expect(parseResendEvent("[]")).toBeNull();
    expect(parseResendEvent(JSON.stringify({ data: {} }))).toBeNull();
  });
});

describe("fetchResendRawMessage", () => {
  it("looks the email up, then downloads the signed raw link", async () => {
    const calls: Array<{ url: string; auth: string | undefined }> = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const headers = (init?.headers ?? {}) as Record<string, string>;
      calls.push({ url, auth: headers.Authorization });
      if (url.endsWith("/emails/receiving/abc-123")) {
        return new Response(
          JSON.stringify({
            id: "abc-123",
            message_id: "<x@example.org>",
            raw: { download_url: "https://cdn.example.test/raw.eml", expires_at: "later" },
          }),
          { status: 200 }
        );
      }
      return new Response("From: a@example.org\r\n\r\nhi", { status: 200 });
    }) as unknown as typeof fetch;

    const result = await fetchResendRawMessage("abc-123", {
      apiKey: "re_test",
      fetchImpl,
      baseUrl: "https://api.example.test",
    });
    expect(result.messageId).toBe("<x@example.org>");
    expect(result.raw.toString()).toBe("From: a@example.org\r\n\r\nhi");
    expect(calls).toEqual([
      { url: "https://api.example.test/emails/receiving/abc-123", auth: "Bearer re_test" },
      { url: "https://cdn.example.test/raw.eml", auth: undefined },
    ]);
  });

  it("fails clearly when the lookup is rejected or has no raw link", async () => {
    const denied = (async () => new Response("{}", { status: 404 })) as unknown as typeof fetch;
    await expect(
      fetchResendRawMessage("abc", { apiKey: "re_test", fetchImpl: denied })
    ).rejects.toThrow(/HTTP 404/);
    const noRaw = (async () => new Response(JSON.stringify({ id: "abc" }), { status: 200 })) as unknown as typeof fetch;
    await expect(
      fetchResendRawMessage("abc", { apiKey: "re_test", fetchImpl: noRaw })
    ).rejects.toThrow(/raw download link/);
  });

  it("enforces the raw size ceiling", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) =>
      String(input).includes("/emails/receiving/")
        ? new Response(JSON.stringify({ raw: { download_url: "https://cdn.example.test/r" } }))
        : new Response("x".repeat(10))
    ) as unknown as typeof fetch;
    await expect(
      fetchResendRawMessage("abc", { apiKey: "re_test", fetchImpl, maxBytes: 5 })
    ).rejects.toThrow(/exceeds/);
  });
});
