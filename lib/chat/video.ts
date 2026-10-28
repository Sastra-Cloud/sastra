/** Local input may be larger; the server still enforces its 50 MB upload limit. */
export const CHAT_VIDEO_INPUT_BYTES = 500 * 1024 * 1024;
export const CHAT_VIDEO_UPLOAD_BYTES = 50 * 1024 * 1024;
export const CHAT_VIDEO_TARGET_BYTES = 45 * 1024 * 1024;
export const CHAT_VIDEO_MAX_SECONDS = 10 * 60;
export const CHAT_VIDEO_AUDIO_BITRATE = 96_000;

export type ChatVideoQuality = "standard" | "high" | "original";
export type ChatVideoProgress = { progress: number; height?: number };
export type ChatVideoResult = { file: File };

export function isChatVideo(file: Pick<File, "name" | "type">) {
  const mime = file.type.toLowerCase();
  // WebM and MP4 can contain audio only, including the chat voice recorder.
  if (mime.startsWith("audio/")) return false;
  return mime.startsWith("video/") || /\.(mp4|m4v|mov|webm|mkv)$/i.test(file.name);
}

/** Original-file fallback is limited to the formats accepted by the upload API. */
export function originalChatVideo(file: File): File | null {
  if (file.size <= 0 || file.size > CHAT_VIDEO_UPLOAD_BYTES) return null;
  const mime = file.type.split(";", 1)[0].toLowerCase();
  const type = mime === "video/mp4" || mime === "video/quicktime" ? mime
    : /\.(mp4|m4v)$/i.test(file.name) ? "video/mp4"
    : /\.mov$/i.test(file.name) ? "video/quicktime" : null;
  if (!type) return null;
  return file.type === type ? file : new File([file], file.name, { type, lastModified: file.lastModified });
}

/**
 * There is no dependable "already compressed" flag. Compare the complete
 * file's byte budget with our proposed encode, rather than a VBR sample or
 * a filename. Saving less than 20% is not worth another lossy generation.
 * Larger passthrough clips stay within 1080p/30 for practical chat playback.
 */
export function shouldPreserveChatVideo(input: {
  sizeBytes: number; duration: number; width: number; height: number;
  frameRate: number; targetVideoBitrate: number; videoCodec: string | null; audioCodec: string | null;
}) {
  const { sizeBytes, duration, width, height, frameRate, targetVideoBitrate, videoCodec, audioCodec } = input;
  if (![sizeBytes, duration, width, height, targetVideoBitrate].every(value => Number.isFinite(value) && value > 0)
    || sizeBytes > CHAT_VIDEO_UPLOAD_BYTES || videoCodec !== "avc" || (audioCodec !== null && audioCodec !== "aac")) return false;
  if (sizeBytes <= 8 * 1024 * 1024) return true;
  if (!Number.isFinite(frameRate) || frameRate <= 0 || frameRate > 30.5
    || Math.max(width, height) > 1920 || Math.min(width, height) > 1080) return false;
  const estimatedBytes = (targetVideoBitrate + CHAT_VIDEO_AUDIO_BITRATE) * duration / 8;
  return estimatedBytes >= sizeBytes * 0.8;
}

/**
 * Chat delivery preset, not an archival export. 720p/2.5 Mbps sits between
 * LiveKit's measured 720p H.264 webcam (1.25 Mbps) and high-motion (3.5 Mbps)
 * examples: https://livekit.com/webrtc/bitrate-guide
 * VBR leaves detail where needed. A duration budget plus a resolution ladder
 * avoids trying to squeeze a long clip into an unreadably low 1080p bitrate.
 */
export function chatVideoPlan(width: number, height: number, duration: number, quality: Exclude<ChatVideoQuality, "original">) {
  if (![width, height, duration].every(value => Number.isFinite(value) && value > 0)) {
    throw new Error("This video could not be read. Choose another video or share a link.");
  }
  if (duration > CHAT_VIDEO_MAX_SECONDS) {
    throw new Error("Choose a video under ten minutes, shorten it, or share a link.");
  }
  if (Math.max(width, height) > 4096 || width * height > 4096 * 2160) {
    throw new Error("Resize this video to 4K or smaller, or share a link.");
  }
  const budget = (CHAT_VIDEO_TARGET_BYTES * 8 * 0.94) / duration - CHAT_VIDEO_AUDIO_BITRATE;
  const ladder = [
    { edge: 1080, bitrate: 4_500_000, minimum: 1_800_000 },
    { edge: 720, bitrate: 2_500_000, minimum: 900_000 },
    { edge: 540, bitrate: 1_400_000, minimum: 600_000 },
    { edge: 480, bitrate: 1_000_000, minimum: 450_000 },
    { edge: 360, bitrate: 600_000, minimum: 250_000 },
  ];
  const maxEdge = quality === "high" ? 1080 : 720;
  const preset = ladder.find(item => item.edge <= maxEdge && budget >= item.minimum);
  if (!preset) throw new Error("Shorten this video or share a link to keep it clear.");
  // Bound both orientations: portrait stays portrait, and small files never upscale.
  const scale = Math.min(1, preset.edge / Math.min(width, height), (preset.edge * 16 / 9) / Math.max(width, height));
  const outputWidth = Math.max(2, Math.floor(width * scale / 2) * 2);
  const outputHeight = Math.max(2, Math.floor(height * scale / 2) * 2);
  const pixelRatio = Math.min(1, outputWidth * outputHeight / (preset.edge ** 2 * 16 / 9));
  return {
    width: outputWidth,
    height: outputHeight,
    bitrate: Math.round(Math.min(budget, preset.bitrate * pixelRatio)),
  };
}

export type ChatVideoWorkerRequest = { file: File; quality: "standard" | "high" };
export type ChatVideoWorkerResponse =
  | { type: "progress"; value: ChatVideoProgress }
  | { type: "done"; result: ChatVideoResult }
  | { type: "error"; error: string };
