import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { recordR2Operation } from "@/lib/ai/usage";
import { resolveStorageConfig, type StorageConfig } from "@/lib/r2/config";

export const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB
export const MAX_DONATION_CSV_BYTES = 5 * 1024 * 1024;

// Allowlist of accepted MIME types (publishing docs, images, office, archives).
const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "application/epub+zip",
  "audio/mpeg",
  "audio/wav",
  "audio/mp4",
  "audio/webm",
  "audio/ogg",
  "video/mp4",
  "video/quicktime",
]);

export function isAllowedMime(mime: string): boolean {
  const normalized = mime.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return ALLOWED_MIME.has(normalized);
}

export function validateUpload(mime: string, size: number): string | null {
  if (!isAllowedMime(mime)) return "That file type isn't allowed.";
  if (size <= 0) return "Empty file.";
  if (size > MAX_FILE_BYTES) return "File exceeds the 50 MB limit.";
  return null;
}

// Resolved lazily so importing this module never throws at build time; the
// first storage call surfaces a StorageConfigError naming the missing variables.
let _config: StorageConfig | null = null;
function config(): StorageConfig {
  return (_config ??= resolveStorageConfig());
}

let _client: S3Client | null = null;
function client(): S3Client {
  if (_client) return _client;
  const { endpoint, region, accessKeyId, secretAccessKey } = config();
  _client = new S3Client({
    region,
    endpoint,
    forcePathStyle: true, // works for MinIO (dev), R2, Railway Buckets, and S3
    credentials: { accessKeyId, secretAccessKey },
  });
  return _client;
}

const bucket = () => config().bucket;

/** Tenant-free object key: uploads/YYYY/MM/<id>.<ext> */
export function buildKey(fileId: string, originalName: string): string {
  const ext = originalName.includes(".")
    ? originalName.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "")
    : "bin";
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `uploads/${yyyy}/${mm}/${fileId}.${ext}`;
}

export function buildDonationImportKey(fileId: string) {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `donation-imports/${yyyy}/${mm}/${fileId}.csv`;
}

export function buildWikiImageStagingKey(mediaId: string, originalName: string) {
  const ext = originalName.includes(".")
    ? originalName.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "")
    : "bin";
  return `wiki-staging/${mediaId}.${ext || "bin"}`;
}

export function buildWikiImageKey(mediaId: string) {
  return `wiki/images/${mediaId}.webp`;
}

export function buildWikiVideoKey(mediaId: string) {
  return `wiki/videos/${mediaId}.mp4`;
}

export function buildWikiVideoPosterKey(mediaId: string) {
  return `wiki/video-posters/${mediaId}.jpg`;
}

export function buildWikiVideoCaptionKey(mediaId: string) {
  return `wiki/video-captions/${mediaId}.vtt`;
}

export async function presignPut(key: string, contentType: string) {
  return getSignedUrl(
    client(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }),
    { expiresIn: 300 }
  );
}

export async function presignGet(
  key: string,
  downloadName?: string,
  expiresIn = 300
) {
  return getSignedUrl(
    client(),
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
      ResponseContentDisposition: downloadName
        ? `attachment; filename="${downloadName.replace(/"/g, "")}"`
        : undefined,
    }),
    { expiresIn }
  );
}

/** Server-side upload for bytes we already hold (e.g. a Gmail attachment). */
export async function putObject(
  key: string,
  body: Uint8Array | Buffer,
  contentType: string
) {
  await client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  await recordR2Operation({
    classType: "A",
    operationName: "PutObject",
    metadata: { key },
  }).catch((err) => console.error("R2 PutObject metering failed:", err));
}

export class ObjectTooLargeError extends Error {
  constructor() {
    super("Stored object exceeds the allowed size.");
    this.name = "ObjectTooLargeError";
  }
}

export async function readBodyBounded(
  body: Uint8Array | AsyncIterable<Uint8Array>,
  maxBytes?: number
) {
  if (body instanceof Uint8Array) {
    if (maxBytes && body.byteLength > maxBytes) throw new ObjectTooLargeError();
    return Buffer.from(body);
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of body) {
    total += chunk.byteLength;
    if (maxBytes && total > maxBytes) {
      if ("destroy" in (body as object)) {
        (body as unknown as { destroy: () => void }).destroy();
      }
      throw new ObjectTooLargeError();
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function getObjectBuffer(
  key: string,
  options?: { maxBytes?: number }
): Promise<Buffer> {
  const r = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  await recordR2Operation({
    classType: "B",
    operationName: "GetObject",
    metadata: { key },
  }).catch((err) => console.error("R2 GetObject metering failed:", err));
  const body = r.Body;
  if (!body) return Buffer.alloc(0);
  const maxBytes = options?.maxBytes;
  if (maxBytes && Number(r.ContentLength ?? 0) > maxBytes) {
    throw new ObjectTooLargeError();
  }
  return readBodyBounded(
    body as Uint8Array | AsyncIterable<Uint8Array>,
    maxBytes
  );
}

export async function getObjectPrefix(key: string, length = 64): Promise<Buffer> {
  const r = await client().send(
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
      Range: `bytes=0-${Math.max(0, length - 1)}`,
    })
  );
  await recordR2Operation({
    classType: "B",
    operationName: "GetObject",
    metadata: { key, range: `0-${Math.max(0, length - 1)}` },
  }).catch((err) => console.error("R2 GetObject metering failed:", err));
  const body = r.Body;
  if (!body) return Buffer.alloc(0);
  if (body instanceof Uint8Array) return Buffer.from(body);
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function headObject(key: string) {
  const r = await client().send(
    new HeadObjectCommand({ Bucket: bucket(), Key: key })
  );
  await recordR2Operation({
    classType: "B",
    operationName: "HeadObject",
    metadata: { key },
  }).catch((err) => console.error("R2 HeadObject metering failed:", err));
  return { size: Number(r.ContentLength ?? 0), contentType: r.ContentType };
}

export async function deleteObject(key: string) {
  await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
