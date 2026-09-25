import { describe, expect, it } from "vitest";

import {
  isAllowedMime,
  ObjectTooLargeError,
  readBodyBounded,
} from "./index";

describe("isAllowedMime", () => {
  it("accepts browser-recorded audio MIME types with codec parameters", () => {
    expect(isAllowedMime("audio/webm;codecs=opus")).toBe(true);
    expect(isAllowedMime("audio/mp4; codecs=mp4a.40.2")).toBe(true);
  });

  it("still rejects unapproved media types", () => {
    expect(isAllowedMime("audio/flac")).toBe(false);
  });
});

describe("readBodyBounded", () => {
  it("stops before buffering more than the configured ceiling", async () => {
    async function* chunks() {
      yield new Uint8Array(3);
      yield new Uint8Array(3);
    }
    await expect(readBodyBounded(chunks(), 5)).rejects.toBeInstanceOf(
      ObjectTooLargeError
    );
  });

  it("returns content within the configured ceiling", async () => {
    expect(await readBodyBounded(new TextEncoder().encode("csv"), 5)).toEqual(
      Buffer.from("csv")
    );
  });
});
