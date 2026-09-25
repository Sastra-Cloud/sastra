import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth/guards";
import { can } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { wikiMedia, wikiPages } from "@/lib/db/schema";
import { buildWikiImageStagingKey, presignPut } from "@/lib/r2";
import { hasTrustedRequestOrigin } from "@/lib/security/request-origin";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const schema = z.object({
  pageId: z.string().uuid(),
  fileName: z.string().trim().min(1).max(300),
  contentType: z.string().trim().min(1).max(100),
  sizeBytes: z.number().int().positive().max(MAX_IMAGE_BYTES),
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
      { error: "Images must be JPEG, PNG, or WebP files no larger than 20 MB." },
      { status: 400 }
    );
  }
  if (!IMAGE_MIME.has(parsed.data.contentType)) {
    return NextResponse.json(
      { error: "Images must be JPEG, PNG, or WebP files." },
      { status: 400 }
    );
  }
  const [page] = await db
    .select({ id: wikiPages.id })
    .from(wikiPages)
    .where(and(eq(wikiPages.id, parsed.data.pageId), isNull(wikiPages.deletedAt)))
    .limit(1);
  if (!page) return NextResponse.json({ error: "Wiki page not found" }, { status: 404 });

  const mediaId = randomUUID();
  const key = buildWikiImageStagingKey(mediaId, parsed.data.fileName);
  await db.insert(wikiMedia).values({
    id: mediaId,
    pageId: page.id,
    kind: "image",
    status: "pending",
    r2Key: key,
    originalName: parsed.data.fileName,
    mimeType: parsed.data.contentType,
    sizeBytes: parsed.data.sizeBytes,
    createdBy: session.user.id,
    orphanedAt: new Date(),
  });
  const uploadUrl = await presignPut(key, parsed.data.contentType);
  return NextResponse.json({ mediaId, uploadUrl });
}
