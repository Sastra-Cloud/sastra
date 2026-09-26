import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth/guards";
import { can } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { wikiMedia, wikiPages } from "@/lib/db/schema";
import {
  buildWikiVideoKey,
  buildWikiVideoPosterKey,
  presignPut,
} from "@/lib/r2";
import { hasTrustedRequestOrigin } from "@/lib/security/request-origin";
import {
  MAX_WIKI_VIDEO_BYTES,
  MAX_WIKI_VIDEO_DURATION_SECONDS,
  MAX_WIKI_VIDEO_POSTER_BYTES,
  validateWikiVideoInspection,
} from "@/lib/wiki/video";
import { assertStorageAvailable } from "@/lib/hosted/storage-usage";

function validLanguage(value: string) {
  try {
    return Intl.getCanonicalLocales(value).length === 1;
  } catch {
    return false;
  }
}

const schema = z.object({
  pageId: z.string().uuid(),
  fileName: z.string().trim().min(1).max(300),
  contentType: z.literal("video/mp4"),
  sizeBytes: z.number().int().positive().max(MAX_WIKI_VIDEO_BYTES),
  durationSeconds: z.number().positive().max(MAX_WIKI_VIDEO_DURATION_SECONDS),
  width: z.number().int().positive().max(4096),
  height: z.number().int().positive().max(4096),
  posterSizeBytes: z.number().int().positive().max(MAX_WIKI_VIDEO_POSTER_BYTES),
  spokenLanguage: z.string().trim().min(2).max(35).refine(validLanguage),
});

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
    return NextResponse.json(
      { error: "Choose a compressed MP4 no larger than 500 MB or 30 minutes." },
      { status: 400 }
    );
  }
  const validationError = validateWikiVideoInspection(parsed.data);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }
  const space = await assertStorageAvailable(parsed.data.sizeBytes);
  if (!space.ok) return NextResponse.json({ error: space.error }, { status: 413 });

  const [page] = await db
    .select({ id: wikiPages.id })
    .from(wikiPages)
    .where(and(eq(wikiPages.id, parsed.data.pageId), isNull(wikiPages.deletedAt)))
    .limit(1);
  if (!page) {
    return NextResponse.json({ error: "Wiki page not found" }, { status: 404 });
  }

  const pendingCount = await db
    .select({ id: wikiMedia.id })
    .from(wikiMedia)
    .where(
      and(
        eq(wikiMedia.createdBy, session.user.id),
        eq(wikiMedia.kind, "video"),
        eq(wikiMedia.status, "pending")
      )
    );
  if (pendingCount.length >= 3) {
    return NextResponse.json(
      { error: "Finish an existing video upload before starting another." },
      { status: 429 }
    );
  }

  const mediaId = randomUUID();
  const videoKey = buildWikiVideoKey(mediaId);
  await db.insert(wikiMedia).values({
    id: mediaId,
    pageId: page.id,
    kind: "video",
    status: "pending",
    r2Key: videoKey,
    originalName: parsed.data.fileName,
    mimeType: parsed.data.contentType,
    sizeBytes: parsed.data.sizeBytes,
    width: parsed.data.width,
    height: parsed.data.height,
    durationSeconds: Math.ceil(parsed.data.durationSeconds),
    spokenLanguage: parsed.data.spokenLanguage,
    captionStatus: "not_requested",
    createdBy: session.user.id,
    orphanedAt: new Date(),
  });

  try {
    const [uploadUrl, posterUploadUrl] = await Promise.all([
      presignPut(videoKey, "video/mp4"),
      presignPut(buildWikiVideoPosterKey(mediaId), "image/jpeg"),
    ]);
    return NextResponse.json({ mediaId, uploadUrl, posterUploadUrl });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Could not start video upload";
    await db
      .update(wikiMedia)
      .set({ status: "failed", errorMessage: message.slice(0, 500), updatedAt: new Date() })
      .where(eq(wikiMedia.id, mediaId));
    return NextResponse.json(
      { error: "Private video storage is unavailable or not configured." },
      { status: 503 }
    );
  }
}
