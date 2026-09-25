import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { recordR2Operation } from "@/lib/ai/usage";
import { getSession } from "@/lib/auth/guards";
import { can } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { wikiMedia } from "@/lib/db/schema";
import {
  buildWikiVideoPosterKey,
  deleteObject,
  getObjectPrefix,
  headObject,
} from "@/lib/r2";
import { hasTrustedRequestOrigin } from "@/lib/security/request-origin";
import {
  MAX_WIKI_VIDEO_BYTES,
  MAX_WIKI_VIDEO_POSTER_BYTES,
  hasJpegFileSignature,
  hasMp4FileSignature,
  validateWikiVideoInspection,
} from "@/lib/wiki/video";

const schema = z.object({ mediaId: z.string().uuid() });

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
    return NextResponse.json({ error: "Invalid video identifier" }, { status: 400 });
  }

  const [media] = await db
    .select()
    .from(wikiMedia)
    .where(
      and(
        eq(wikiMedia.id, parsed.data.mediaId),
        eq(wikiMedia.kind, "video"),
        eq(wikiMedia.createdBy, session.user.id)
      )
    )
    .limit(1);
  if (!media?.r2Key || media.status !== "pending") {
    return NextResponse.json({ error: "Video upload not found" }, { status: 404 });
  }

  const posterKey = buildWikiVideoPosterKey(media.id);
  try {
    const [videoHead, posterHead, videoPrefix, posterPrefix] = await Promise.all([
      headObject(media.r2Key),
      headObject(posterKey),
      getObjectPrefix(media.r2Key),
      getObjectPrefix(posterKey),
    ]);
    if (
      videoHead.size <= 0 ||
      videoHead.size > MAX_WIKI_VIDEO_BYTES ||
      videoHead.size !== media.sizeBytes ||
      videoHead.contentType !== "video/mp4" ||
      !hasMp4FileSignature(videoPrefix)
    ) {
      throw new Error("The uploaded video did not match the inspected file");
    }
    if (
      posterHead.size <= 0 ||
      posterHead.size > MAX_WIKI_VIDEO_POSTER_BYTES ||
      posterHead.contentType !== "image/jpeg" ||
      !hasJpegFileSignature(posterPrefix)
    ) {
      throw new Error("The video preview image was invalid");
    }
    const validationError = validateWikiVideoInspection({
      contentType: media.mimeType ?? "",
      fileName: media.originalName ?? "",
      sizeBytes: videoHead.size,
      durationSeconds: media.durationSeconds ?? 0,
      width: media.width ?? 0,
      height: media.height ?? 0,
    });
    if (validationError) throw new Error(validationError);

    await db
      .update(wikiMedia)
      .set({
        status: "ready",
        sizeBytes: videoHead.size,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(wikiMedia.id, media.id));
    await recordR2Operation({
      classType: "A",
      operationName: "PutObject",
      units: 2,
      actorUserId: session.user.id,
      entityType: "wiki_media",
      entityId: media.id,
      metadata: { kind: "video_and_poster" },
    }).catch((error) => console.error("R2 video upload metering failed:", error));
    return NextResponse.json({ mediaId: media.id, status: "ready" });
  } catch (cause) {
    await Promise.all([
      deleteObject(media.r2Key).catch(() => undefined),
      deleteObject(posterKey).catch(() => undefined),
    ]);
    const message = cause instanceof Error ? cause.message : "Video validation failed";
    await db
      .update(wikiMedia)
      .set({ status: "failed", errorMessage: message.slice(0, 500), updatedAt: new Date() })
      .where(eq(wikiMedia.id, media.id));
    return NextResponse.json(
      { error: "The uploaded video could not be verified. Convert it to a compressed MP4 and try again." },
      { status: 400 }
    );
  }
}
