import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { files } from "@/lib/db/schema";
import { buildKey, presignPut, validateUpload } from "@/lib/r2";

const schema = z.object({
  fileName: z.string().min(1).max(300),
  contentType: z.string().min(1).max(150),
  sizeBytes: z.number().int().positive(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { fileName, contentType, sizeBytes } = parsed.data;

  const invalid = validateUpload(contentType, sizeBytes);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const fileId = randomUUID();
  const key = buildKey(fileId, fileName);

  await db.insert(files).values({
    id: fileId,
    r2Key: key,
    originalName: fileName,
    mimeType: contentType,
    sizeBytes,
    status: "pending",
    uploadedBy: session.user.id,
  });

  const uploadUrl = await presignPut(key, contentType);
  return NextResponse.json({ fileId, uploadUrl });
}
