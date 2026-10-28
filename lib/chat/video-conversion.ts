import {
  Input, BlobSource, ALL_FORMATS, Output, BufferTarget, Mp4OutputFormat,
  Conversion, Quality, canEncodeAudio, Mp4InputFormat,
} from "mediabunny";
import {
  CHAT_VIDEO_AUDIO_BITRATE, CHAT_VIDEO_UPLOAD_BYTES, chatVideoPlan, originalChatVideo, shouldPreserveChatVideo,
  type ChatVideoWorkerRequest, type ChatVideoResult, type ChatVideoProgress,
} from "./video";

/** Repackage compatible tracks without touching their encoded picture or sound. */
async function copyChatVideo(input: Input, file: File, onProgress: (value: ChatVideoProgress) => void): Promise<ChatVideoResult | null> {
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target });
  let conversion: Conversion | undefined;
  try {
    target.on("write", ({ start, end }) => {
      if (Math.max(start, end) > CHAT_VIDEO_UPLOAD_BYTES) void conversion?.cancel();
    });
    conversion = await Conversion.init({
      input, output, tracks: "primary", tags: {}, showWarnings: false,
      // Never let a packaging-only path silently fall back to an encoder.
      copy: { mode: "forced" },
    });
    if (!conversion.isValid || conversion.discardedTracks.length > 0) return null;
    conversion.onProgress = progress => onProgress({ progress: Math.min(0.99, progress) });
    await conversion.execute();
    if (!target.buffer?.byteLength || target.buffer.byteLength > CHAT_VIDEO_UPLOAD_BYTES) return null;
    return { file: new File([target.buffer], `${file.name.replace(/\.[^.]+$/, "") || "video"}.mp4`, { type: "video/mp4", lastModified: file.lastModified }) };
  } catch {
    // Some source timelines cannot be copied to MP4. Keep the normal, validated
    // conversion path available; never send a partial copy with missing tracks.
    return null;
  } finally {
    await conversion?.cancel();
  }
}

/** Runs only in the worker. BlobSource reads slices instead of copying the input into RAM. */
export async function convertChatVideo(
  { file, quality }: ChatVideoWorkerRequest,
  onProgress: (value: ChatVideoProgress) => void,
): Promise<ChatVideoResult> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  let conversion: Conversion | undefined;
  try {
    const video = await input.getPrimaryVideoTrack();
    const audio = await input.getPrimaryAudioTrack();
    if (!video) throw new Error("This file has no video. Choose another file.");
    const [width, height, duration, format, metrics] = await Promise.all([
      video.getDisplayWidth(), video.getDisplayHeight(), input.computeDuration(), input.getFormat(),
      video.computeFrameRateMetrics(),
    ]);
    const plan = chatVideoPlan(width, height, duration, quality);
    const original = originalChatVideo(file);
    if (shouldPreserveChatVideo({
      sizeBytes: file.size, width, height, duration, frameRate: metrics.bestGuessFrameRate,
      targetVideoBitrate: plan.bitrate, videoCodec: video.codec, audioCodec: audio ? audio.codec ?? "unknown" : null,
    })) {
      if (format instanceof Mp4InputFormat && original?.type === "video/mp4") return { file: original };
      const copied = await copyChatVideo(input, file, onProgress);
      if (copied) return copied;
    }
    if (!(await video.canDecode()) || (audio && !(await audio.canDecode()))) {
      throw new Error("This browser cannot prepare this video. Choose Original for a file under 50 MB, or share a link.");
    }
    if (audio && !(await canEncodeAudio("aac"))) {
      // Small audio-only WASM fallback, not the heavyweight ffmpeg.wasm video engine.
      const { registerAacEncoder } = await import("@mediabunny/aac-encoder");
      registerAacEncoder();
    }
    const frameRate = Number.isFinite(metrics.bestGuessFrameRate) && metrics.bestGuessFrameRate > 0
      ? Math.min(30, metrics.bestGuessFrameRate) : 30;
    const target = new BufferTarget();
    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: "in-memory" }),
      target,
    });
    let tooLarge = false;
    target.on("write", ({ start, end }) => {
      if (Math.max(start, end) > CHAT_VIDEO_UPLOAD_BYTES) {
        tooLarge = true;
        void conversion?.cancel();
      }
    });
    conversion = await Conversion.init({
      input, output,
      tracks: "primary",
      tags: {}, // Do not carry camera/location metadata into the shared chat copy.
      showWarnings: false,
      video: {
        width: plan.width, height: plan.height, codec: "avc", quality: new Quality({ bitrate: plan.bitrate }),
        frameRate, fit: "contain", keyFrameInterval: 2,
        hardwareAcceleration: "prefer-hardware", allowTransformationMetadata: false,
      },
      audio: { codec: "aac", quality: new Quality({ bitrate: CHAT_VIDEO_AUDIO_BITRATE }), numberOfChannels: 2 },
    });
    // Never silently send a silent clip when the original had sound.
    if (!conversion.isValid || conversion.discardedTracks.length > 0) {
      throw new Error("This browser cannot keep the video's picture and sound. Choose Original under 50 MB, or share a link.");
    }
    const displayHeight = Math.min(plan.width, plan.height);
    onProgress({ progress: 0, height: displayHeight });
    conversion.onProgress = progress => onProgress({ progress: Math.min(0.99, progress), height: displayHeight });
    try {
      await conversion.execute();
    } catch (error) {
      if (tooLarge) throw new Error("This video is still too large. Shorten it or share a link.");
      throw error;
    }
    const buffer = target.buffer;
    if (!buffer?.byteLength || buffer.byteLength > CHAT_VIDEO_UPLOAD_BYTES) {
      throw new Error("This video is still too large. Shorten it or share a link.");
    }
    if (original && video.codec === "avc" && (!audio || audio.codec === "aac") && buffer.byteLength >= file.size) {
      return { file: original };
    }
    return {
      file: new File([buffer], `${file.name.replace(/\.[^.]+$/, "") || "video"}.mp4`, {
        type: "video/mp4", lastModified: file.lastModified,
      }),
    };
  } finally {
    await conversion?.cancel();
    input.dispose();
  }
}
