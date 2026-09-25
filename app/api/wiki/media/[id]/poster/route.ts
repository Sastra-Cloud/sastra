import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/guards";
import { buildWikiVideoPosterKey, presignGet } from "@/lib/r2";
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
  if (!media?.r2Key || media.kind !== "video" || media.status !== "ready") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const response = NextResponse.redirect(
    await presignGet(buildWikiVideoPosterKey(media.id), undefined, 60 * 60)
  );
  response.headers.set("Cache-Control", "private, max-age=60");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}
