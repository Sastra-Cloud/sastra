import { describe, expect, it } from "vitest";

import {
  MAX_WIKI_VIDEO_BITRATE_BPS,
  hasJpegFileSignature,
  hasMp4FileSignature,
  validateWikiVideoInspection,
  wikiVideoBitrateBps,
} from "./video";

const validVideo = {
  contentType: "video/mp4",
  fileName: "tutorial.mp4",
  sizeBytes: 50 * 1024 * 1024,
  durationSeconds: 18 * 60,
  width: 1920,
  height: 1080,
};

describe("Wiki R2 video validation", () => {
  it("accepts a compressed, browser-ready MP4", () => {
    expect(validateWikiVideoInspection(validVideo)).toBeNull();
  });

  it("rejects unsupported containers", () => {
    expect(
      validateWikiVideoInspection({
        ...validVideo,
        contentType: "video/quicktime",
        fileName: "tutorial.mov",
      })
    ).toMatch(/MP4/);
  });

  it("rejects videos over the average bitrate limit", () => {
    const durationSeconds = 60;
    const sizeBytes = Math.ceil((MAX_WIKI_VIDEO_BITRATE_BPS * durationSeconds) / 8) + 1;
    expect(validateWikiVideoInspection({ ...validVideo, durationSeconds, sizeBytes })).toMatch(
      /8 Mbps/
    );
  });

  it("rejects videos longer than 30 minutes", () => {
    expect(
      validateWikiVideoInspection({ ...validVideo, durationSeconds: 30 * 60 + 1 })
    ).toMatch(/30 minutes/);
  });

  it("calculates average bitrate from file size and duration", () => {
    expect(wikiVideoBitrateBps(1_000_000, 10)).toBe(800_000);
  });

  it("recognizes MP4 and JPEG signatures used during upload completion", () => {
    expect(
      hasMp4FileSignature(
        new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d])
      )
    ).toBe(true);
    expect(hasMp4FileSignature(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(false);
    expect(hasJpegFileSignature(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
  });
});
