import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/guards";
import { presignGet } from "@/lib/r2";
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
  if (!media || media.kind !== "video" || media.status !== "ready") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!media.r2Key) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    return NextResponse.json(
      {
        videoUrl: await presignGet(media.r2Key, undefined, 60 * 60),
        posterUrl: `/api/wiki/media/${media.id}/poster`,
        captionUrl:
          media.captionStatus === "ready"
            ? `/api/wiki/media/${media.id}/captions`
            : null,
        spokenLanguage: media.spokenLanguage,
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch {
    return NextResponse.json({ error: "Video playback is unavailable." }, { status: 503 });
  }
}
