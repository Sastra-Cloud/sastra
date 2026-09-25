const AVATAR_MIME_TYPE = "image/webp";
export const MAX_AVATAR_BYTES = 512 * 1024;

export type StoredAvatar = {
  base64: string;
  bytes: Buffer;
  mimeType: typeof AVATAR_MIME_TYPE;
};

/** Validate and decode the cropped WebP data produced by the profile cropper. */
export function decodeAvatarDataUrl(value: string): StoredAvatar {
  if (value.length > Math.ceil((MAX_AVATAR_BYTES * 4) / 3) + 100) {
    throw new Error("Profile photo is too large after cropping.");
  }

  const prefix = `data:${AVATAR_MIME_TYPE};base64,`;
  if (!value.startsWith(prefix)) {
    throw new Error("Profile photo must be a cropped WebP image.");
  }

  const base64 = value.slice(prefix.length);
  const bytes = Buffer.from(base64, "base64");
  const isWebp =
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP";

  if (!isWebp) throw new Error("Profile photo data is invalid.");
  if (bytes.length > MAX_AVATAR_BYTES) {
    throw new Error("Profile photo is too large after cropping.");
  }

  return { base64, bytes, mimeType: AVATAR_MIME_TYPE };
}
