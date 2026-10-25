"use server";

import { eq } from "drizzle-orm";

import { requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { fileAttachments, files } from "@/lib/db/schema";
import { deleteObject } from "@/lib/r2";
import { canMutateAttachmentTarget } from "./target-access";

const ATTACHMENT_NOTES_MAX_LENGTH = 1000;

export async function updateAttachmentNotes(
  attachmentId: string,
  notes: string
) {
  const { user } = await requireUser();
  if (!attachmentId || typeof notes !== "string") {
    throw new Error("Invalid attachment note.");
  }
  const normalized = notes.trim();
  if (normalized.length > ATTACHMENT_NOTES_MAX_LENGTH) {
    throw new Error("File notes must be 1,000 characters or fewer.");
  }

  const [target] = await db
    .select({
      targetType: fileAttachments.targetType,
      targetId: fileAttachments.targetId,
    })
    .from(fileAttachments)
    .where(eq(fileAttachments.id, attachmentId))
    .limit(1);
  if (!target) throw new Error("Attachment not found.");

  if (!(await canMutateAttachmentTarget(target.targetType, target.targetId, user))) {
    throw new Error("Attachment not found.");
  }

  const [updated] = await db
    .update(fileAttachments)
    .set({ notes: normalized || null })
    .where(eq(fileAttachments.id, attachmentId))
    .returning({
      attachmentId: fileAttachments.id,
      notes: fileAttachments.notes,
    });
  if (!updated) throw new Error("Attachment not found.");
  return updated;
}

/**
 * Remove an attachment. If the underlying file is no longer attached to anything,
 * delete the file record and its R2 object too.
 */
export async function removeAttachment(attachmentId: string) {
  const { user } = await requireUser();
  const [target] = await db
    .select({
      targetType: fileAttachments.targetType,
      targetId: fileAttachments.targetId,
    })
    .from(fileAttachments)
    .where(eq(fileAttachments.id, attachmentId))
    .limit(1);
  if (!target) return;
  if (!(await canMutateAttachmentTarget(target.targetType, target.targetId, user))) {
    throw new Error("Attachment not found.");
  }

  const [att] = await db
    .delete(fileAttachments)
    .where(eq(fileAttachments.id, attachmentId))
    .returning({ fileId: fileAttachments.fileId });
  if (!att) return;

  const remaining = await db
    .select({ id: fileAttachments.id })
    .from(fileAttachments)
    .where(eq(fileAttachments.fileId, att.fileId))
    .limit(1);

  if (remaining.length === 0) {
    const [file] = await db
      .delete(files)
      .where(eq(files.id, att.fileId))
      .returning({ r2Key: files.r2Key });
    if (file) {
      try {
        await deleteObject(file.r2Key);
      } catch {
        // best-effort; an orphan-sweep can reclaim it later
      }
    }
  }
}
