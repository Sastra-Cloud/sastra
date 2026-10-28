import { beforeEach, describe, expect, it, vi } from "vitest";
import { convertChatVideo } from "./video-conversion";

const media = vi.hoisted(() => ({
  dispose: vi.fn(), cancel: vi.fn(), execute: vi.fn(),
  audio: { codec: "aac", canDecode: async () => true },
  discardedTracks: [] as unknown[], bytes: 1024, nativeAac: true, registerAac: vi.fn(),
  format: "mp4", duration: 60, frameRate: 30, videoCodec: "avc", init: vi.fn(), canDecodeVideo: vi.fn(async () => true),
  copyDiscardedTracks: [] as unknown[],
}));
vi.mock("mediabunny", () => {
  class Mp4InputFormat {}
  return {
  Mp4InputFormat,
  Input: class {
    async getPrimaryVideoTrack() { return { codec: media.videoCodec, getDisplayWidth: async () => 1920,
      getDisplayHeight: async () => 1080, canDecode: media.canDecodeVideo,
      computeFrameRateMetrics: async () => ({ bestGuessFrameRate: media.frameRate }) }; }
    async getPrimaryAudioTrack() { return media.audio; }
    async computeDuration() { return media.duration; }
    async getFormat() { return media.format === "mp4" ? new Mp4InputFormat() : {}; }
    dispose = media.dispose;
  },
  BlobSource: class {}, ALL_FORMATS: [], Mp4OutputFormat: class {}, Quality: class {},
  BufferTarget: class { buffer = new ArrayBuffer(media.bytes); on() {} },
  Output: class {}, canEncodeAudio: async () => media.nativeAac,
  Conversion: { init: (...args: unknown[]) => {
    media.init(...args);
    const copy = (args[0] as { copy?: unknown }).copy;
    return Promise.resolve({ isValid: true, discardedTracks: copy ? media.copyDiscardedTracks : media.discardedTracks, cancel: media.cancel, execute: media.execute });
  } },
}; });
vi.mock("@mediabunny/aac-encoder", () => ({ registerAacEncoder: media.registerAac }));

beforeEach(() => {
  vi.clearAllMocks(); media.discardedTracks = []; media.copyDiscardedTracks = []; media.bytes = 1024; media.nativeAac = true;
  media.format = "mp4"; media.duration = 60; media.frameRate = 30; media.videoCodec = "avc"; media.audio.codec = "aac";
});

describe("chat video conversion safety", () => {
  it("uses the audio fallback when native AAC encoding is missing", async () => {
    media.nativeAac = false;
    media.audio.codec = "pcm-s16";
    const file = new File([new Uint8Array(9 * 1024 * 1024)], "clip.mov", { type: "video/quicktime" });
    const result = await convertChatVideo({ file, quality: "standard" }, vi.fn());
    expect(media.registerAac).toHaveBeenCalledOnce();
    expect(media.execute).toHaveBeenCalledOnce();
    expect(result.file.type).toBe("video/mp4");
  });
  it("keeps a small compatible MP4 intact and releases inspection resources", async () => {
    const file = new File(["already compressed"], "clip.mp4", { type: "video/mp4" });
    expect((await convertChatVideo({ file, quality: "standard" }, vi.fn())).file).toBe(file);
    expect(media.execute).not.toHaveBeenCalled();
    expect(media.dispose).toHaveBeenCalled();
  });

  it("does not send a video with silently discarded audio", async () => {
    media.audio.codec = "pcm-s16";
    media.discardedTracks = [{ track: media.audio, reason: "undecodable_source" }];
    await expect(convertChatVideo({ file: new File(["video"], "phone.mov"), quality: "standard" }, vi.fn()))
      .rejects.toThrow("picture and sound");
    expect(media.execute).not.toHaveBeenCalled();
    expect(media.cancel).toHaveBeenCalled();
    expect(media.dispose).toHaveBeenCalled();
  });

  it("checks the real output size instead of trusting the bitrate estimate", async () => {
    media.videoCodec = "hevc";
    media.bytes = 51 * 1024 * 1024;
    await expect(convertChatVideo({ file: new File(["video"], "phone.mov"), quality: "standard" }, vi.fn()))
      .rejects.toThrow("still too large");
    expect(media.execute).toHaveBeenCalled();
    expect(media.dispose).toHaveBeenCalled();
  });

  it("skips encoding a larger efficient MP4 before touching browser codecs", async () => {
    media.duration = 120;
    const file = new File([new Uint8Array(18 * 1024 * 1024)], "shared.mp4", { type: "video/mp4" });
    expect((await convertChatVideo({ file, quality: "standard" }, vi.fn())).file).toBe(file);
    expect(media.init).not.toHaveBeenCalled();
    expect(media.canDecodeVideo).not.toHaveBeenCalled();
    expect(media.registerAac).not.toHaveBeenCalled();
  });

  it("copies an efficient MOV's encoded tracks into MP4 without requiring an encoder", async () => {
    // Some MOV-named files contain MP4 data but still have a QuickTime MIME type.
    media.format = "mp4";
    media.duration = 120;
    const file = new File([new Uint8Array(18 * 1024 * 1024)], "shared.mov", { type: "video/quicktime" });
    const result = await convertChatVideo({ file, quality: "standard" }, vi.fn());
    expect(result.file.type).toBe("video/mp4");
    expect(media.init).toHaveBeenCalledWith(expect.objectContaining({ copy: { mode: "forced" } }));
    expect(media.init.mock.calls[0][0]).not.toHaveProperty("video");
    expect(media.init.mock.calls[0][0]).not.toHaveProperty("audio");
    expect(media.canDecodeVideo).not.toHaveBeenCalled();
    expect(media.registerAac).not.toHaveBeenCalled();
  });

  it("still compresses a high-bitrate clip when meaningful savings are expected", async () => {
    media.duration = 10;
    const file = new File([new Uint8Array(18 * 1024 * 1024)], "large.mp4", { type: "video/mp4" });
    const result = await convertChatVideo({ file, quality: "standard" }, vi.fn());
    expect(result.file.size).toBeLessThan(file.size);
    expect(media.canDecodeVideo).toHaveBeenCalled();
    expect(media.init).toHaveBeenCalledWith(expect.objectContaining({ video: expect.objectContaining({ codec: "avc" }) }));
  });

  it("falls back to a full conversion when a copy would discard sound", async () => {
    media.format = "mov";
    media.duration = 120;
    media.copyDiscardedTracks = [{ track: media.audio, reason: "cannot_copy" }];
    const file = new File([new Uint8Array(18 * 1024 * 1024)], "shared.mov", { type: "video/quicktime" });
    const result = await convertChatVideo({ file, quality: "standard" }, vi.fn());
    expect(result.file.type).toBe("video/mp4");
    expect(media.canDecodeVideo).toHaveBeenCalled();
    expect(media.init).toHaveBeenLastCalledWith(expect.objectContaining({ audio: expect.objectContaining({ codec: "aac" }) }));
  });
});
