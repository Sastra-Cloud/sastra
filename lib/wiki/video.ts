export const MAX_WIKI_VIDEO_BYTES = 500 * 1024 * 1024;
export const MAX_WIKI_VIDEO_DURATION_SECONDS = 30 * 60;
export const MAX_WIKI_VIDEO_BITRATE_BPS = 8_000_000;
export const MAX_WIKI_VIDEO_PIXELS = 4096 * 2160;
export const MAX_WIKI_VIDEO_DIMENSION = 4096;
export const MAX_WIKI_VIDEO_POSTER_BYTES = 2 * 1024 * 1024;

export type WikiVideoInspection = {
  contentType: string;
  fileName: string;
  sizeBytes: number;
  durationSeconds: number;
  width: number;
  height: number;
};

export function wikiVideoBitrateBps(sizeBytes: number, durationSeconds: number) {
  if (!Number.isFinite(sizeBytes) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  return (sizeBytes * 8) / durationSeconds;
}

export function hasMp4FileSignature(bytes: Uint8Array) {
  return (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  );
}

export function hasJpegFileSignature(bytes: Uint8Array) {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export function validateWikiVideoInspection(input: WikiVideoInspection): string | null {
  if (input.contentType !== "video/mp4" || !input.fileName.toLowerCase().endsWith(".mp4")) {
    return "Choose an MP4 video. MOV, WebM, and MKV files need to be converted first.";
  }
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return "The video file is empty.";
  }
  if (input.sizeBytes > MAX_WIKI_VIDEO_BYTES) {
    return "Private wiki videos must be 500 MB or smaller.";
  }
  if (!Number.isFinite(input.durationSeconds) || input.durationSeconds < 1) {
    return "Sastra could not read this video's duration. Convert it to a standard MP4 and try again.";
  }
  if (input.durationSeconds > MAX_WIKI_VIDEO_DURATION_SECONDS) {
    return "Private wiki videos must be 30 minutes or shorter.";
  }
  if (
    !Number.isFinite(input.width) ||
    !Number.isFinite(input.height) ||
    input.width <= 0 ||
    input.height <= 0
  ) {
    return "Sastra could not read this video's dimensions. Convert it to a standard MP4 and try again.";
  }
  if (
    input.width > MAX_WIKI_VIDEO_DIMENSION ||
    input.height > MAX_WIKI_VIDEO_DIMENSION ||
    input.width * input.height > MAX_WIKI_VIDEO_PIXELS
  ) {
    return "Videos larger than 4K need to be resized before uploading.";
  }
  if (wikiVideoBitrateBps(input.sizeBytes, input.durationSeconds) > MAX_WIKI_VIDEO_BITRATE_BPS) {
    return "This video averages more than 8 Mbps and needs to be compressed before uploading.";
  }
  return null;
}
