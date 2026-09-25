import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/guards";
import { can } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { wikiMedia } from "@/lib/db/schema";
import { buildWikiVideoCaptionKey, getObjectBuffer, putObject } from "@/lib/r2";
import { hasTrustedRequestOrigin } from "@/lib/security/request-origin";
import { getWikiMediaRecord, mayAccessWikiMedia } from "@/lib/wiki/queries";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || !session.user.isActive) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!(await mayAccessWikiMedia(id, session.user.role))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const media = await getWikiMediaRecord(id);
  if (
    !media?.r2Key ||
    media.kind !== "video" ||
    media.status !== "ready" ||
    media.captionStatus !== "ready"
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const captions = await getObjectBuffer(buildWikiVideoCaptionKey(media.id));
    return new NextResponse(new Uint8Array(captions), {
      headers: {
        "Content-Type": "text/vtt; charset=utf-8",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Captions unavailable" }, { status: 404 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
  const { id } = await params;
  const media = await getWikiMediaRecord(id);
  if (
    !media?.r2Key ||
    media.kind !== "video" ||
    media.status !== "ready" ||
    !media.spokenLanguage
  ) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size <= 0 || file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "Choose a WebVTT file no larger than 10 MB." }, { status: 400 });
  }
  const text = await file.text();
  if (!text.trimStart().startsWith("WEBVTT")) {
    return NextResponse.json({ error: "Captions must use WebVTT format." }, { status: 400 });
  }
  try {
    await putObject(
      buildWikiVideoCaptionKey(media.id),
      Buffer.from(text, "utf8"),
      "text/vtt"
    );
    await db
      .update(wikiMedia)
      .set({ captionStatus: "ready", updatedAt: new Date() })
      .where(eq(wikiMedia.id, media.id));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "We couldn't upload those captions." }, { status: 502 });
  }
}
