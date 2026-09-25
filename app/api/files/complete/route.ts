import { after, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getSession } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { chatMessages, fileAttachments, files } from "@/lib/db/schema";
import { recordR2Operation } from "@/lib/ai/usage";
import { deleteObject, headObject, validateUpload } from "@/lib/r2";
import { can } from "@/lib/auth/policy";
import { ensurePrintPaymentTask } from "@/lib/print/payment-tasks";
import { enqueueAndProcessAgreementAttachment } from "@/lib/agreement-chat/indexing";
import { canAccessMessage } from "@/lib/chat/access";

const schema = z.object({
  fileId: z.string().uuid(),
  targetType: z
    .enum([
      "message",
      "task",
      "rights_item",
      "budget_item",
      "project",
      "print_quote",
      "print_payment",
      "license_fee_payment",
      "agreement_group",
    ])
    .optional(),
  targetId: z.string().uuid().optional(),
  label: z.string().max(40).optional(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { fileId, targetType, targetId, label } = parsed.data;
  if (
    targetType === "agreement_group" &&
    !can(session.user, "project.edit")
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [file] = await db
    .select()
    .from(files)
    .where(eq(files.id, fileId))
    .limit(1);
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (file.uploadedBy !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (file.purpose !== "workspace_attachment" || file.status !== "pending") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (
    targetType === "message" &&
    targetId &&
    !(await canAccessMessage(targetId, session.user.id))
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Confirm the object actually landed in the bucket and re-read its real size.
  let size = file.sizeBytes;
  try {
    const head = await headObject(file.r2Key);
    const actualType =
      head.contentType?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
    const expectedType =
      file.mimeType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
    const invalid = validateUpload(actualType, head.size);
    if (invalid || actualType !== expectedType) {
      throw new Error("Stored object does not match the upload request.");
    }
    size = head.size;
  } catch {
    await db
      .update(files)
      .set({ status: "failed" })
      .where(eq(files.id, fileId));
    await deleteObject(file.r2Key).catch(() => undefined);
    return NextResponse.json(
      { error: "The uploaded file could not be verified." },
      { status: 400 }
    );
  }

  await db
    .update(files)
    .set({ status: "ready", sizeBytes: size })
    .where(eq(files.id, fileId));
  await recordR2Operation({
    classType: "A",
    operationName: "PutObject",
    actorUserId: session.user.id,
    userId: session.user.id,
    entityType: "file",
    entityId: fileId,
    metadata: { source: "presigned_upload_complete" },
  }).catch((err) => console.error("file complete R2 metering failed:", err));

  if (targetType && targetId) {
    const [attachment] = await db
      .insert(fileAttachments)
      .values({ fileId, targetType, targetId, label: label ?? null })
      .returning({ id: fileAttachments.id });
    if (
      attachment &&
      targetType === "rights_item" &&
      (label === "mou" || label === "license")
    ) {
      after(async () => {
        await enqueueAndProcessAgreementAttachment(attachment.id).catch((error) =>
          console.error("Immediate agreement indexing failed; cron will retry:", error)
        );
      });
    }
    // Touch the chat message so realtime picks up the new attachment.
    if (targetType === "message") {
      await db
        .update(chatMessages)
        .set({ updatedAt: new Date() })
        .where(eq(chatMessages.id, targetId));
    }
    // A direct invoice upload onto an existing planned printer payment makes
    // that payment actionable, just like accepting an extracted invoice.
    if (targetType === "print_payment" && label === "invoice") {
      await ensurePrintPaymentTask(targetId, session.user.id);
    }
  }

  return NextResponse.json({ ok: true });
}
