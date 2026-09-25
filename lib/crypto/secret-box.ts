import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";

/**
 * Authenticated encryption for secrets that must live in the database, such
 * as an admin-entered provider API key.
 *
 * - AES-256-GCM with a fresh 96-bit IV per seal.
 * - Key derived with HKDF-SHA256 from `APP_ENCRYPTION_KEY`, falling back to
 *   `BETTER_AUTH_SECRET` so an existing deployment keeps working. Set
 *   `APP_ENCRYPTION_KEY` to decouple stored secrets from session signing.
 * - Versioned wire format `v1:<iv>:<tag>:<data>` (base64) so the scheme can
 *   be rotated without guessing how old rows were sealed.
 */

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const HKDF_SALT = "sastra.secret-box";
const HKDF_INFO = `secret-box.${VERSION}`;

export class SecretBoxError extends Error {
  constructor(
    message: string,
    readonly code: "not_configured" | "malformed" | "unreadable"
  ) {
    super(message);
    this.name = "SecretBoxError";
  }
}

export function secretBoxKeyMaterial(env = process.env): string | null {
  const material = env.APP_ENCRYPTION_KEY || env.BETTER_AUTH_SECRET;
  return material && material.length > 0 ? material : null;
}

/** True when a key can be derived, i.e. secrets can be sealed and opened. */
export function secretBoxConfigured(env = process.env): boolean {
  return secretBoxKeyMaterial(env) !== null;
}

function deriveKey(keyMaterial?: string): Buffer {
  const material = keyMaterial ?? secretBoxKeyMaterial();
  if (!material) {
    throw new SecretBoxError(
      "APP_ENCRYPTION_KEY (or BETTER_AUTH_SECRET) is not set — stored secrets cannot be encrypted.",
      "not_configured"
    );
  }
  return Buffer.from(hkdfSync("sha256", material, HKDF_SALT, HKDF_INFO, KEY_BYTES));
}

/** Encrypt `plaintext`; returns the versioned ciphertext string. */
export function sealSecret(
  plaintext: string,
  options: { keyMaterial?: string } = {}
): string {
  const key = deriveKey(options.keyMaterial);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    data.toString("base64"),
  ].join(":");
}

/**
 * Decrypt a value produced by {@link sealSecret}. Throws `SecretBoxError`
 * (`malformed` or `unreadable`) rather than returning partial data; a tampered
 * or wrong-key ciphertext never decrypts.
 */
export function openSecret(
  ciphertext: string,
  options: { keyMaterial?: string } = {}
): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new SecretBoxError("Stored secret has an unknown format.", "malformed");
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new SecretBoxError("Stored secret has an unknown format.", "malformed");
  }
  const key = deriveKey(options.keyMaterial);
  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: TAG_BYTES,
    });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    throw new SecretBoxError(
      "Stored secret could not be decrypted — was the encryption key changed?",
      "unreadable"
    );
  }
}
