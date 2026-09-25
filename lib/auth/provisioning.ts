import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const MAX_GRANT_AGE_MS = 5 * 60 * 1000;
export const PROVISIONING_HEADER = "x-sastra-provisioning";

type Purpose = "invite" | "bootstrap";
type Payload = {
  email: string;
  purpose: Purpose;
  issuedAt: number;
  nonce: string;
};

export function isInitialAdminBootstrapEnabled() {
  return process.env.ENABLE_INITIAL_ADMIN_BOOTSTRAP === "true";
}

function secret() {
  const value =
    process.env.AUTH_PROVISIONING_SECRET ??
    (process.env.NODE_ENV !== "production"
      ? process.env.BETTER_AUTH_SECRET
      : undefined);
  if (!value) throw new Error("AUTH_PROVISIONING_SECRET is not configured.");
  return value;
}

function signature(encoded: string) {
  return createHmac("sha256", secret())
    .update(`sastra-provisioning-v1.${encoded}`)
    .digest("base64url");
}

export function createProvisioningGrant(email: string, purpose: Purpose) {
  const payload: Payload = {
    email: email.trim().toLowerCase(),
    purpose,
    issuedAt: Date.now(),
    nonce: randomBytes(16).toString("base64url"),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded)}`;
}

export function verifyProvisioningGrant(
  raw: string | null,
  email: string
): Payload | null {
  if (!raw) return null;
  const [encoded, supplied, extra] = raw.split(".");
  if (!encoded || !supplied || extra) return null;
  const expected = signature(encoded);
  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  if (
    suppliedBytes.length !== expectedBytes.length ||
    !timingSafeEqual(suppliedBytes, expectedBytes)
  ) {
    return null;
  }
  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    ) as Payload;
    if (
      payload.email !== email.trim().toLowerCase() ||
      (payload.purpose !== "invite" && payload.purpose !== "bootstrap") ||
      !Number.isFinite(payload.issuedAt) ||
      payload.issuedAt > Date.now() + 30_000 ||
      Date.now() - payload.issuedAt > MAX_GRANT_AGE_MS ||
      typeof payload.nonce !== "string" ||
      payload.nonce.length < 16
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
