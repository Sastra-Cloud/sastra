import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { recordDependencyAudit } from "@/lib/security/dependency-monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  status: z.enum(["passed", "failed"]),
  checkedAt: z.iso.datetime({ offset: true }),
});

function authorized(request: Request) {
  const configured = process.env.SECURITY_STATUS_WEBHOOK_SECRET;
  const authorization = request.headers.get("authorization");
  if (!configured || !authorization?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(authorization.slice("Bearer ".length).trim());
  const expected = Buffer.from(configured);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid report." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }
  const checkedAt = new Date(parsed.data.checkedAt);
  const drift = Math.abs(Date.now() - checkedAt.getTime());
  if (drift > 15 * 60 * 1000) {
    return NextResponse.json(
      { error: "Report timestamp is outside the accepted window." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  await recordDependencyAudit({
    status: parsed.data.status,
    checkedAt,
  });
  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } }
  );
}
