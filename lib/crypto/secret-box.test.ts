import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  SecretBoxError,
  openSecret,
  sealSecret,
  secretBoxConfigured,
  secretBoxKeyMaterial,
} from "./secret-box";

const KEY = "unit-test-app-encryption-key";

describe("secret-box", () => {
  const original = {
    app: process.env.APP_ENCRYPTION_KEY,
    auth: process.env.BETTER_AUTH_SECRET,
  };

  beforeEach(() => {
    delete process.env.APP_ENCRYPTION_KEY;
    delete process.env.BETTER_AUTH_SECRET;
  });

  afterEach(() => {
    if (original.app === undefined) delete process.env.APP_ENCRYPTION_KEY;
    else process.env.APP_ENCRYPTION_KEY = original.app;
    if (original.auth === undefined) delete process.env.BETTER_AUTH_SECRET;
    else process.env.BETTER_AUTH_SECRET = original.auth;
  });

  it("round-trips a secret with a versioned ciphertext", () => {
    const sealed = sealSecret("sk-or-v1-abc123", { keyMaterial: KEY });
    expect(sealed.startsWith("v1:")).toBe(true);
    expect(sealed.split(":")).toHaveLength(4);
    expect(sealed).not.toContain("sk-or-v1-abc123");
    expect(openSecret(sealed, { keyMaterial: KEY })).toBe("sk-or-v1-abc123");
  });

  it("uses a fresh IV per seal so equal plaintexts differ", () => {
    const a = sealSecret("same", { keyMaterial: KEY });
    const b = sealSecret("same", { keyMaterial: KEY });
    expect(a).not.toBe(b);
    expect(openSecret(a, { keyMaterial: KEY })).toBe("same");
    expect(openSecret(b, { keyMaterial: KEY })).toBe("same");
  });

  it("detects tampering with the data or the tag", () => {
    const sealed = sealSecret("do-not-touch", { keyMaterial: KEY });
    const [v, iv, tag, data] = sealed.split(":");
    const flippedData = Buffer.from(data, "base64");
    flippedData[0] ^= 0xff;
    const tamperedData = [v, iv, tag, flippedData.toString("base64")].join(":");
    expect(() => openSecret(tamperedData, { keyMaterial: KEY })).toThrowError(
      SecretBoxError
    );

    const flippedTag = Buffer.from(tag, "base64");
    flippedTag[3] ^= 0x01;
    const tamperedTag = [v, iv, flippedTag.toString("base64"), data].join(":");
    expect(() => openSecret(tamperedTag, { keyMaterial: KEY })).toThrowError(
      /could not be decrypted/
    );
  });

  it("fails with the wrong key", () => {
    const sealed = sealSecret("secret", { keyMaterial: KEY });
    let caught: unknown;
    try {
      openSecret(sealed, { keyMaterial: "another-key" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SecretBoxError);
    expect((caught as SecretBoxError).code).toBe("unreadable");
  });

  it("rejects malformed or unversioned input", () => {
    expect(() => openSecret("nope", { keyMaterial: KEY })).toThrowError(
      /unknown format/
    );
    expect(() => openSecret("v9:a:b:c", { keyMaterial: KEY })).toThrowError(
      /unknown format/
    );
    expect(() => openSecret("v1:a:b:c", { keyMaterial: KEY })).toThrowError(
      /unknown format/
    );
  });

  it("derives the key from APP_ENCRYPTION_KEY, then BETTER_AUTH_SECRET", () => {
    expect(secretBoxConfigured()).toBe(false);
    expect(() => sealSecret("x")).toThrowError(/not set/);

    process.env.BETTER_AUTH_SECRET = "auth-secret";
    expect(secretBoxKeyMaterial()).toBe("auth-secret");
    const sealedWithAuth = sealSecret("x");
    expect(openSecret(sealedWithAuth)).toBe("x");

    process.env.APP_ENCRYPTION_KEY = "dedicated-key";
    expect(secretBoxKeyMaterial()).toBe("dedicated-key");
    expect(() => openSecret(sealedWithAuth)).toThrowError(SecretBoxError);
    expect(openSecret(sealSecret("y"))).toBe("y");
  });
});
