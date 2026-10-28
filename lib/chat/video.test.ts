import { describe, expect, it } from "vitest";
import { chatVideoPlan, CHAT_VIDEO_AUDIO_BITRATE, CHAT_VIDEO_TARGET_BYTES, originalChatVideo, isChatVideo, shouldPreserveChatVideo } from "./video";

describe("chat video delivery budget", () => {
  it("preserves useful existing quality without letting incompatible or oversized clips bypass preparation", () => {
    const ready = { sizeBytes: 18 * 1024 * 1024, duration: 120, width: 1080, height: 1920,
      frameRate: 30, targetVideoBitrate: 2_500_000, videoCodec: "avc", audioCodec: "aac" };
    expect(shouldPreserveChatVideo(ready)).toBe(true);
    expect(shouldPreserveChatVideo({ ...ready, duration: 10 })).toBe(false);
    expect(shouldPreserveChatVideo({ ...ready, videoCodec: "hevc" })).toBe(false);
    expect(shouldPreserveChatVideo({ ...ready, audioCodec: "unknown" })).toBe(false);
    expect(shouldPreserveChatVideo({ ...ready, sizeBytes: 51 * 1024 * 1024 })).toBe(false);
    expect(shouldPreserveChatVideo({ ...ready, frameRate: 60 })).toBe(false);
    expect(shouldPreserveChatVideo({ ...ready, width: 2160, height: 3840 })).toBe(false);
  });
  it("keeps audio-only WebM voice recordings out of the video pipeline", () => {
    expect(isChatVideo({ name: "voice.webm", type: "audio/webm;codecs=opus" })).toBe(false);
    expect(isChatVideo({ name: "audio.mp4", type: "audio/mp4" })).toBe(false);
    expect(isChatVideo({ name: "phone.mov", type: "" })).toBe(true);
  });
  // A long phone clip must fit the upload budget without stretching or producing
  // an unusably low bitrate at its original resolution.
  it("budgets long clips and preserves portrait orientation without upscaling", () => {
    const plan = chatVideoPlan(2160, 3840, 600, "high");
    expect(plan.width).toBeLessThan(plan.height);
    expect(plan.height / plan.width).toBeCloseTo(3840 / 2160, 1);
    expect(plan.width).toBeLessThan(720);
    expect((plan.bitrate + CHAT_VIDEO_AUDIO_BITRATE) * 600 / 8).toBeLessThan(CHAT_VIDEO_TARGET_BYTES);
    const small = chatVideoPlan(320, 240, 30, "high");
    expect(small.width).toBeLessThanOrEqual(320);
    expect(small.height).toBeLessThanOrEqual(240);
    expect(() => chatVideoPlan(1920, 1080, 601, "standard")).toThrow("ten minutes");
  });

  it("preserves an allowed original while rejecting oversized and unsupported fallback files", () => {
    const mp4 = new File(["video"], "phone.MP4");
    expect(originalChatVideo(mp4)?.type).toBe("video/mp4");
    expect(originalChatVideo(new File(["video"], "capture.webm", { type: "video/webm" }))).toBeNull();
    expect(originalChatVideo(new File([new Uint8Array(51 * 1024 * 1024)], "large.mp4", { type: "video/mp4" }))).toBeNull();
  });
});
