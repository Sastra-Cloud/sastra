import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { isAdminAssured } from "@/lib/auth/assurance";
import { getSession } from "@/lib/auth/guards";
import { can } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { files } from "@/lib/db/schema";
import {
  buildDonationImportKey,
  MAX_DONATION_CSV_BYTES,
  presignPut,
} from "@/lib/r2";
import { hasTrustedRequestOrigin } from "@/lib/security/request-origin";
import { assertStorageAvailable } from "@/lib/hosted/storage-usage";

const requestSchema = z.object({
  fileName: z.string().min(1).max(300),
  contentType: z.enum(["text/csv", "application/vnd.ms-excel"]),
  sizeBytes: z.number().int().positive().max(MAX_DONATION_CSV_BYTES),
});

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
  if (
    !parsed.success ||
    !parsed.data.fileName.trim().toLowerCase().endsWith(".csv")
  ) {
    return NextResponse.json(
      { error: "Choose a CSV file no larger than 5 MB." },
      { status: 400 }
    );
  }
  const space = await assertStorageAvailable(parsed.data.sizeBytes);
  if (!space.ok) return NextResponse.json({ error: space.error }, { status: 413 });

  const fileId = randomUUID();
  const r2Key = buildDonationImportKey(fileId);
  await db.insert(files).values({
    id: fileId,
    r2Key,
    originalName: parsed.data.fileName,
    mimeType: parsed.data.contentType,
    sizeBytes: parsed.data.sizeBytes,
    status: "pending",
    purpose: "donation_import",
    uploadedBy: session.user.id,
  });
  return NextResponse.json({
    fileId,
    uploadUrl: await presignPut(r2Key, parsed.data.contentType),
  });
}
