import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { getSession } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { files } from "@/lib/db/schema";
import { recordR2Operation } from "@/lib/ai/usage";
import { canAccessFile } from "@/lib/chat/access";
import { getObjectBuffer, presignGet } from "@/lib/r2";
import { isAdminAssured } from "@/lib/auth/assurance";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user.isActive) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const [file] = await db.select().from(files).where(eq(files.id, id)).limit(1);
  if (!file || file.status !== "ready") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await canAccessFile(file.id, session.user.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (
    file.purpose === "donation_import" &&
    !(await isAdminAssured(
      session.user.id,
      request.headers.get("cookie")
    ))
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // `?inline=1` serves the object inline (no attachment disposition) — used for
  // avatars and other in-page images. Default hands out an attachment download.
  const inline = new URL(request.url).searchParams.get("inline") === "1";
  await recordR2Operation({
    classType: "B",
    operationName: "GetObject",
    actorUserId: session.user.id,
    userId: session.user.id,
    entityType: "file",
    entityId: file.id,
    metadata: {
      source: "file_download_redirect",
      inline,
    },
  }).catch(() => {});
  if (inline && file.mimeType === "application/pdf") {
    // Keep PDF frames on the app origin; a storage redirect is blocked by frame-src.
    const content = await getObjectBuffer(file.r2Key);
    return new Response(new Uint8Array(content), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline",
        "Content-Length": String(content.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  const url = inline
    ? await presignGet(file.r2Key)
    : await presignGet(file.r2Key, file.originalName);
  const res = NextResponse.redirect(url);
  if (inline) res.headers.set("Cache-Control", "private, max-age=300");
  return res;
}
