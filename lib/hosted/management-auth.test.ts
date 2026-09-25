import { describe, expect, it } from "vitest";

import { MANAGEMENT_HEADERS, signManagementRequest, verifyManagementRequest } from "./management-auth";

const secret = "test-secret";
const body = JSON.stringify({ seatLimit: 15 });
const now = 1_790_000_000;

function headersFor(overrides: Record<string, string> = {}) {
  const base: Record<string, string> = {
    [MANAGEMENT_HEADERS.timestamp]: String(now),
    [MANAGEMENT_HEADERS.eventId]: "evt_1",
    [MANAGEMENT_HEADERS.signature]: signManagementRequest(secret, now, "evt_1", body),
    ...overrides,
  };
  return { get: (name: string) => base[name.toLowerCase()] ?? null };
}

describe("verifyManagementRequest", () => {
  it("accepts a correctly signed request", () => {
    expect(verifyManagementRequest({ secret, headers: headersFor(), body, now })).toEqual({
      ok: true,
      timestamp: now,
      eventId: "evt_1",
    });
  });

  it("rejects missing headers, stale timestamps, and tampered bodies or ids", () => {
    expect(verifyManagementRequest({ secret, headers: headersFor({ [MANAGEMENT_HEADERS.signature]: "" }), body, now }))
      .toEqual({ ok: false, reason: "missing" });
    expect(verifyManagementRequest({ secret, headers: headersFor(), body, now: now + 6 * 60 })).toEqual({
      ok: false,
      reason: "stale",
    });
    expect(verifyManagementRequest({ secret, headers: headersFor(), body: body + " ", now })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(
      verifyManagementRequest({ secret, headers: headersFor({ [MANAGEMENT_HEADERS.eventId]: "evt_2" }), body, now })
    ).toEqual({ ok: false, reason: "invalid" });
    expect(verifyManagementRequest({ secret: "other", headers: headersFor(), body, now })).toEqual({
      ok: false,
      reason: "invalid",
    });
  });
});
