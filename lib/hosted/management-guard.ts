import "server-only";

import { NextResponse } from "next/server";

import { verifyManagementRequest } from "./management-auth";
import { isHostedInstance } from "./mode";

export type ManagementRequest =
  | { ok: true; body: string; eventId: string }
  | { ok: false; response: NextResponse };

/**
 * Gate for `/api/internal/management/*`. Self-hosted installations answer 404
 * so the endpoints are invisible there; hosted instances require a valid
 * signature from the control plane.
 */
export async function authorizeManagementRequest(request: Request): Promise<ManagementRequest> {
  const secret = process.env.SASTRA_CLOUD_MANAGEMENT_SECRET?.trim();
  if (!isHostedInstance() || !secret) {
    return { ok: false, response: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  const body = await request.text();
  const verified = verifyManagementRequest({ secret, headers: request.headers, body });
  if (!verified.ok) {
    return {
      ok: false,
      response: NextResponse.json({ error: `Unauthorized (${verified.reason})` }, { status: 401 }),
    };
  }
  return { ok: true, body, eventId: verified.eventId };
}
