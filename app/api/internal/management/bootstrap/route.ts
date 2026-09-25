import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { invitations, user } from "@/lib/db/schema";
import { recordManagementEvent } from "@/lib/hosted/entitlements";
import { authorizeManagementRequest } from "@/lib/hosted/management-guard";
import { generateToken, hashToken } from "@/lib/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INVITE_TTL_DAYS = 7;

const bodySchema = z.object({ email: z.string().email() });

/**
 * Create the workspace's first super-admin invitation. The link is returned
 * once; a replayed event id is refused (409) because the token is stored only
 * as a hash, so the control plane sends a new event id to get a fresh link.
 * When the person already has an account, nothing is created.
 */
export async function POST(request: Request) {
  const auth = await authorizeManagementRequest(request);
  if (!auth.ok) return auth.response;

  let email: string;
  try {
    email = bodySchema.parse(JSON.parse(auth.body)).email.trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: "Invalid bootstrap request." }, { status: 400 });
  }

  if (!(await recordManagementEvent(auth.eventId, "bootstrap"))) {
    return NextResponse.json({ ok: false, replayed: true }, { status: 409 });
  }

  const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
  if (existing) return NextResponse.json({ ok: true, userExists: true });

  const rawToken = generateToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000);
  await db.transaction(async (tx) => {
    await tx.delete(invitations).where(and(eq(invitations.email, email), isNull(invitations.acceptedAt)));
    await tx.insert(invitations).values({
      email,
      role: "super_admin",
      tokenHash: hashToken(rawToken),
      invitedBy: null,
      expiresAt,
    });
  });

  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  return NextResponse.json({
    ok: true,
    inviteUrl: `${base}/invite/${rawToken}`,
    expiresAt: expiresAt.toISOString(),
  });
}
