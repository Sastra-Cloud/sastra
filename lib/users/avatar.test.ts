import { describe, expect, it } from "vitest";

import { avatarSrc, initials } from "./avatar";

describe("avatarSrc", () => {
  it("resolves uploaded avatar file ids through the inline download route", () => {
    expect(avatarSrc("file-id-123")).toBe(
      "/api/files/file-id-123/download?inline=1"
    );
  });

  it("preserves existing URLs and paths", () => {
    expect(avatarSrc("https://example.com/avatar.jpg")).toBe(
      "https://example.com/avatar.jpg"
    );
    expect(avatarSrc("/avatar.jpg")).toBe("/avatar.jpg");
  });

  it("returns null when no avatar is stored", () => {
    expect(avatarSrc(null)).toBeNull();
  });
});

describe("initials", () => {
  it("provides a stable fallback when an image is unavailable", () => {
    expect(initials("Nathan Wells")).toBe("NW");
    expect(initials(" ")).toBe("?");
  });
});
