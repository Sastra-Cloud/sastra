import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { userAvatars } from "@/lib/db/schema";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const [avatar] = await db
    .select({ data: userAvatars.data, mimeType: userAvatars.mimeType })
    .from(userAvatars)
    .where(eq(userAvatars.userId, id))
    .limit(1);

  if (!avatar?.data || avatar.mimeType !== "image/webp") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const bytes = Buffer.from(avatar.data, "base64");
  return new Response(bytes, {
    headers: {
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Length": String(bytes.length),
      "Content-Type": avatar.mimeType,
    },
  });
}
