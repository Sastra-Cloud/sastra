import { describe, expect, it } from "vitest";

import {
  bodyDigest,
  inboundSigningString,
  signInboundMessage,
  verifyInboundSignature,
} from "./inbound-signature";

const secret = "test-inbound-secret";
const body = Buffer.from("From: a@example.org\r\nSubject: hi\r\n\r\nhello\r\n");
const now = 1_800_000_000;

describe("inbound webhook signature", () => {
  it("signs `${timestamp}.${sha256(body)}` with HMAC-SHA256 as hex", () => {
    expect(bodyDigest("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
    expect(inboundSigningString(now, "abc")).toBe(`${now}.${bodyDigest("abc")}`);
    expect(signInboundMessage({ secret, timestamp: now, body })).toMatch(/^[0-9a-f]{64}$/);
  });

  it("accepts a fresh, correctly signed request", () => {
    const signature = signInboundMessage({ secret, timestamp: now, body });
    expect(
      verifyInboundSignature({ secret, timestamp: String(now), signature, body, now: now + 30 })
    ).toEqual({ ok: true });
  });

  it("rejects when the secret is unset or headers are missing", () => {
    const signature = signInboundMessage({ secret, timestamp: now, body });
    expect(
      verifyInboundSignature({ secret: "", timestamp: String(now), signature, body, now })
    ).toEqual({ ok: false, reason: "missing-secret" });
    expect(
      verifyInboundSignature({ secret, timestamp: null, signature, body, now })
    ).toEqual({ ok: false, reason: "missing-headers" });
    expect(
      verifyInboundSignature({ secret, timestamp: "yesterday", signature, body, now })
    ).toEqual({ ok: false, reason: "bad-timestamp" });
  });

  it("rejects timestamps older than five minutes (or from the future)", () => {
    const signature = signInboundMessage({ secret, timestamp: now, body });
    expect(
      verifyInboundSignature({ secret, timestamp: String(now), signature, body, now: now + 301 })
    ).toEqual({ ok: false, reason: "stale" });
    expect(
      verifyInboundSignature({ secret, timestamp: String(now), signature, body, now: now - 301 })
    ).toEqual({ ok: false, reason: "stale" });
    expect(
      verifyInboundSignature({ secret, timestamp: String(now), signature, body, now: now + 300 })
    ).toEqual({ ok: true });
  });

  it("rejects a wrong secret, a tampered body, and malformed signatures", () => {
    const signature = signInboundMessage({ secret, timestamp: now, body });
    expect(
      verifyInboundSignature({ secret: "other", timestamp: String(now), signature, body, now })
    ).toEqual({ ok: false, reason: "mismatch" });
    expect(
      verifyInboundSignature({
        secret,
        timestamp: String(now),
        signature,
        body: Buffer.concat([body, Buffer.from("x")]),
        now,
      })
    ).toEqual({ ok: false, reason: "mismatch" });
    expect(
      verifyInboundSignature({ secret, timestamp: String(now), signature: "nothex!", body, now })
    ).toEqual({ ok: false, reason: "mismatch" });
    expect(
      verifyInboundSignature({
        secret,
        timestamp: String(now),
        signature: signature.slice(0, 20),
        body,
        now,
      })
    ).toEqual({ ok: false, reason: "mismatch" });
  });
});
