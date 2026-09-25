import "server-only";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { adminTrustedDevices, securityEvents } from "@/lib/db/schema";
import { hashToken } from "@/lib/tokens";

export const ADMIN_ASSURANCE_COOKIE = "sastra_admin_device";
export const ADMIN_ASSURANCE_DAYS = 60;

export function adminAssuranceCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

function cookieValue(header: string | null, name: string) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

export async function isAdminAssured(
  userId: string,
  cookieHeader?: string | null
) {
  const raw =
    cookieHeader === undefined
      ? (await cookies()).get(ADMIN_ASSURANCE_COOKIE)?.value ?? null
      : cookieValue(cookieHeader, ADMIN_ASSURANCE_COOKIE);
  if (!raw) return false;
  const [trusted] = await db
    .select({ id: adminTrustedDevices.id })
    .from(adminTrustedDevices)
    .where(
      and(
        eq(adminTrustedDevices.userId, userId),
        eq(adminTrustedDevices.tokenHash, hashToken(raw)),
        isNull(adminTrustedDevices.revokedAt),
        gt(adminTrustedDevices.expiresAt, new Date())
      )
    )
    .limit(1);
  if (!trusted) return false;
  await db
    .update(adminTrustedDevices)
    .set({ lastUsedAt: new Date() })
    .where(eq(adminTrustedDevices.id, trusted.id));
  return true;
}

export async function createTrustedBrowserRecord(
  userId: string,
  method: "email_code" | "passkey"
) {
  const raw = randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    Date.now() + ADMIN_ASSURANCE_DAYS * 24 * 60 * 60 * 1000
  );
  await db.transaction(async (tx) => {
    await tx.insert(adminTrustedDevices).values({
      userId,
      tokenHash: hashToken(raw),
      verifiedBy: method,
      expiresAt,
    });
    await tx.insert(securityEvents).values({
      actorId: userId,
      event: "admin_assurance_granted",
      method,
    });
  });
  return { raw, expiresAt };
}

export async function trustCurrentBrowser(
  userId: string,
  method: "email_code" | "passkey"
) {
  const trusted = await createTrustedBrowserRecord(userId, method);
  (await cookies()).set(
    ADMIN_ASSURANCE_COOKIE,
    trusted.raw,
    adminAssuranceCookieOptions(trusted.expiresAt)
  );
  return trusted.expiresAt;
}

export async function revokeCurrentBrowser(userId: string) {
  const jar = await cookies();
  const raw = jar.get(ADMIN_ASSURANCE_COOKIE)?.value;
  if (raw) {
    await db
      .update(adminTrustedDevices)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(adminTrustedDevices.userId, userId),
          eq(adminTrustedDevices.tokenHash, hashToken(raw))
        )
      );
  }
  jar.delete(ADMIN_ASSURANCE_COOKIE);
}
