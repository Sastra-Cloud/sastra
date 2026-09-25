import { describe, expect, it } from "vitest";

import { decodeAvatarDataUrl, MAX_AVATAR_BYTES } from "./avatar-data";

function webpDataUrl(extraBytes = 0) {
  const bytes = Buffer.alloc(12 + extraBytes);
  bytes.write("RIFF", 0, "ascii");
  bytes.write("WEBP", 8, "ascii");
  return `data:image/webp;base64,${bytes.toString("base64")}`;
}

describe("decodeAvatarDataUrl", () => {
  it("accepts cropped WebP data", () => {
    const avatar = decodeAvatarDataUrl(webpDataUrl());
    expect(avatar.mimeType).toBe("image/webp");
    expect(avatar.bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
  });

  it("rejects other data URL formats", () => {
    expect(() =>
      decodeAvatarDataUrl("data:image/png;base64,iVBORw0KGgo=")
    ).toThrow("cropped WebP");
  });

  it("rejects malformed WebP bytes", () => {
    expect(() =>
      decodeAvatarDataUrl("data:image/webp;base64,bm90LXdlYnA=")
    ).toThrow("invalid");
  });

  it("rejects cropped images above the storage limit", () => {
    expect(() => decodeAvatarDataUrl(webpDataUrl(MAX_AVATAR_BYTES))).toThrow(
      "too large"
    );
  });
});
