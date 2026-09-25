import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { z } from "zod";

import { getSession } from "@/lib/auth/guards";
import { can } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { wikiMedia } from "@/lib/db/schema";
import {
  buildWikiImageKey,
  deleteObject,
  getObjectBuffer,
  headObject,
  putObject,
} from "@/lib/r2";
import { hasTrustedRequestOrigin } from "@/lib/security/request-origin";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const schema = z.object({ mediaId: z.string().uuid() });

async function normalizeImage(input: Buffer) {
  const base = sharp(input, {
    failOn: "warning",
    limitInputPixels: 40_000_000,
  }).rotate();
  const metadata = await base.metadata();
  if (!metadata.width || !metadata.height) throw new Error("Image dimensions are missing");
  let result = await base
    .clone()
    .resize({ width: 2560, height: 2560, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85, smartSubsample: true, effort: 4 })
    .toBuffer({ resolveWithObject: true });
  if (result.data.length > MAX_OUTPUT_BYTES) {
    result = await base
      .clone()
      .resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 76, smartSubsample: true, effort: 5 })
      .toBuffer({ resolveWithObject: true });
  }
  if (result.data.length > MAX_OUTPUT_BYTES) {
    throw new Error("The normalized image is still larger than 4 MB");
  }
  return result;
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || !session.user.isActive) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!can(session.user, "wiki.edit")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!hasTrustedRequestOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid image identifier" }, { status: 400 });
  }
  const [media] = await db
    .select()
    .from(wikiMedia)
    .where(
      and(
        eq(wikiMedia.id, parsed.data.mediaId),
        eq(wikiMedia.kind, "image"),
        eq(wikiMedia.createdBy, session.user.id)
      )
    )
    .limit(1);
  if (!media?.r2Key) return NextResponse.json({ error: "Image not found" }, { status: 404 });

  const stagingKey = media.r2Key;
  await db
    .update(wikiMedia)
    .set({ status: "processing", updatedAt: new Date(), errorMessage: null })
    .where(eq(wikiMedia.id, media.id));
  try {
    const head = await headObject(stagingKey);
    if (head.size <= 0 || head.size > MAX_IMAGE_BYTES) {
      throw new Error("Image exceeds the 20 MB upload limit");
    }
    const source = await getObjectBuffer(stagingKey);
    const normalized = await normalizeImage(source);
    const finalKey = buildWikiImageKey(media.id);
    await putObject(finalKey, normalized.data, "image/webp");
    await deleteObject(stagingKey).catch(() => undefined);
    await db
      .update(wikiMedia)
      .set({
        status: "ready",
        r2Key: finalKey,
        mimeType: "image/webp",
        sizeBytes: normalized.data.length,
        width: normalized.info.width,
        height: normalized.info.height,
        updatedAt: new Date(),
        errorMessage: null,
      })
      .where(eq(wikiMedia.id, media.id));
    return NextResponse.json({
      mediaId: media.id,
      src: `/api/wiki/media/${media.id}/image`,
      width: normalized.info.width,
      height: normalized.info.height,
    });
  } catch (cause) {
    await deleteObject(stagingKey).catch(() => undefined);
    const message = cause instanceof Error ? cause.message : "Image processing failed";
    await db
      .update(wikiMedia)
      .set({ status: "failed", errorMessage: message.slice(0, 500), updatedAt: new Date() })
      .where(eq(wikiMedia.id, media.id));
    return NextResponse.json(
      { error: "We couldn't process that image. Try a smaller JPEG, PNG, or WebP file." },
      { status: 400 }
    );
  }
}
