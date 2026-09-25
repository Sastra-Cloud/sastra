import "server-only";

import { createHash, randomBytes } from "crypto";

/** A URL-safe random token (the raw value is emailed, never stored). */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** sha256 hex of a token — only the hash is stored in the DB. */
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
