"use server";

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { redirect } from "next/navigation";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";

import { trustCurrentBrowser, revokeCurrentBrowser } from "./assurance";
import { requireRole } from "./guards";
import { db } from "@/lib/db";
import {
  adminAssuranceChallenges,
  adminTrustedDevices,
  securityEvents,
} from "@/lib/db/schema";
import { sendSecurityCodeEmail } from "@/lib/email/security-code";

export type AssuranceState = {
  error?: string;
  codeSent?: boolean;
  challengeId?: string;
};

function safeNext(value: FormDataEntryValue | null) {
  const next = typeof value === "string" ? value : "/dashboard";
  return next.startsWith("/") && !next.startsWith("//")
    ? next
    : "/dashboard";
}

function codeHash(challengeId: string, code: string) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not configured.");
  return createHmac("sha256", secret)
    .update(`sastra-admin-code-v1.${challengeId}.${code}`)
    .digest("hex");
}

export async function requestAdminSecurityCode(
  _previous: AssuranceState,
  _formData: FormData
): Promise<AssuranceState> {
  void _previous;
  void _formData;
  const { user } = await requireRole("admin");
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  const recent = await db
    .select({ id: adminAssuranceChallenges.id })
    .from(adminAssuranceChallenges)
    .where(
      and(
        eq(adminAssuranceChallenges.userId, user.id),
        gt(adminAssuranceChallenges.createdAt, tenMinutesAgo)
      )
    )
    .limit(3);
  if (recent.length >= 3) {
    return { error: "Too many codes requested. Wait a few minutes and try again." };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const [challenge] = await db
    .insert(adminAssuranceChallenges)
    .values({
      userId: user.id,
      codeHash: "pending",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    })
    .returning({ id: adminAssuranceChallenges.id });
  if (!challenge) return { error: "Could not create a security code." };
  await db
    .update(adminAssuranceChallenges)
    .set({ codeHash: codeHash(challenge.id, code) })
    .where(eq(adminAssuranceChallenges.id, challenge.id));

  try {
    await sendSecurityCodeEmail({ to: user.email, code });
  } catch {
    await db
      .delete(adminAssuranceChallenges)
      .where(eq(adminAssuranceChallenges.id, challenge.id));
    return { error: "Could not send the code. Try again." };
  }
  return { codeSent: true, challengeId: challenge.id };
}

export async function verifyAdminSecurityCode(
  _previous: AssuranceState,
  formData: FormData
): Promise<AssuranceState> {
  const { user } = await requireRole("admin");
  const parsed = z
    .object({
      challengeId: z.string().uuid(),
      code: z.string().regex(/^\d{6}$/),
    })
    .safeParse({
      challengeId: formData.get("challengeId"),
      code: String(formData.get("code") ?? "").replace(/\s/g, ""),
    });
  if (!parsed.success) return { error: "Enter the six-digit code." };

  const [challenge] = await db
    .select()
    .from(adminAssuranceChallenges)
    .where(
      and(
        eq(adminAssuranceChallenges.id, parsed.data.challengeId),
        eq(adminAssuranceChallenges.userId, user.id),
        isNull(adminAssuranceChallenges.consumedAt),
        gt(adminAssuranceChallenges.expiresAt, new Date())
      )
    )
    .limit(1);
  if (!challenge || challenge.attempts >= 5) {
    return { error: "That code is invalid or expired." };
  }

  const supplied = Buffer.from(
    codeHash(challenge.id, parsed.data.code),
    "hex"
  );
  const expected = Buffer.from(challenge.codeHash, "hex");
  const matches =
    supplied.length === expected.length && timingSafeEqual(supplied, expected);
  if (!matches) {
    await db
      .update(adminAssuranceChallenges)
      .set({ attempts: challenge.attempts + 1 })
      .where(eq(adminAssuranceChallenges.id, challenge.id));
    return {
      error: "That code is invalid or expired.",
      codeSent: true,
      challengeId: challenge.id,
    };
  }

  await db
    .update(adminAssuranceChallenges)
    .set({ consumedAt: new Date() })
    .where(eq(adminAssuranceChallenges.id, challenge.id));
  await trustCurrentBrowser(user.id, "email_code");
  redirect(safeNext(formData.get("next")));
}

export async function revokeAllTrustedBrowsers() {
  const { user } = await requireRole("admin");
  await db.transaction(async (tx) => {
    await tx
      .update(adminTrustedDevices)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(adminTrustedDevices.userId, user.id),
          isNull(adminTrustedDevices.revokedAt)
        )
      );
    await tx.insert(securityEvents).values({
      actorId: user.id,
      event: "admin_trusted_browsers_revoked",
    });
  });
  await revokeCurrentBrowser(user.id);
}

export async function listTrustedBrowsers() {
  const { user } = await requireRole("admin");
  return db
    .select({
      id: adminTrustedDevices.id,
      verifiedBy: adminTrustedDevices.verifiedBy,
      createdAt: adminTrustedDevices.createdAt,
      lastUsedAt: adminTrustedDevices.lastUsedAt,
      expiresAt: adminTrustedDevices.expiresAt,
    })
    .from(adminTrustedDevices)
    .where(
      and(
        eq(adminTrustedDevices.userId, user.id),
        isNull(adminTrustedDevices.revokedAt),
        gt(adminTrustedDevices.expiresAt, new Date())
      )
    )
    .orderBy(desc(adminTrustedDevices.lastUsedAt));
}
