import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { isAdminAssured } from "@/lib/auth/assurance";
import { getSession } from "@/lib/auth/guards";
import { can } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { files, securityEvents } from "@/lib/db/schema";
import {
  deleteObject,
  headObject,
  MAX_DONATION_CSV_BYTES,
} from "@/lib/r2";
import { hasTrustedRequestOrigin } from "@/lib/security/request-origin";

const requestSchema = z.object({ fileId: z.string().uuid() });
const CSV_MIME = new Set(["text/csv", "application/vnd.ms-excel"]);

export async function POST(request: Request) {
  if (!hasTrustedRequestOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await getSession();
  if (
    !session?.user.isActive ||
    !can(session.user, "donations.manage") ||
    !(await isAdminAssured(session.user.id, request.headers.get("cookie")))
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const parsed = requestSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const [file] = await db
    .select()
    .from(files)
    .where(
      and(
        eq(files.id, parsed.data.fileId),
        eq(files.uploadedBy, session.user.id),
        eq(files.purpose, "donation_import"),
        eq(files.status, "pending")
      )
    )
    .limit(1);
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const actual = await headObject(file.r2Key);
    const contentType =
      actual.contentType?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
    if (
      actual.size <= 0 ||
      actual.size > MAX_DONATION_CSV_BYTES ||
      !CSV_MIME.has(contentType) ||
      contentType !== file.mimeType
    ) {
      throw new Error("invalid donation object");
    }
    await db
      .update(files)
      .set({
        status: "ready",
        sizeBytes: actual.size,
        mimeType: contentType,
      })
      .where(eq(files.id, file.id));
    return NextResponse.json({ ok: true });
  } catch {
    await db.transaction(async (tx) => {
      await tx
        .update(files)
        .set({ status: "failed" })
        .where(eq(files.id, file.id));
      await tx.insert(securityEvents).values({
        actorId: session.user.id,
        event: "donation_upload_rejected",
      });
    });
    await deleteObject(file.r2Key).catch(() => undefined);
    return NextResponse.json(
      { error: "The uploaded CSV could not be verified." },
      { status: 400 }
    );
  }
}
