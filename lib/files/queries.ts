import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { fileAttachments, files } from "@/lib/db/schema";

export type Attachment = {
  attachmentId: string;
  fileId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  label: string | null;
  notes: string | null;
};

type AttachTarget =
  | "message"
  | "task"
  | "rights_item"
  | "budget_item"
  | "project"
  | "print_quote"
  | "print_payment"
  | "license_fee_payment"
  | "agreement_group";

/** Attachments for many targets at once → grouped Map keyed by targetId. */
export async function listAttachmentsByTargets(
  targetType: AttachTarget,
  ids: string[]
): Promise<Map<string, Attachment[]>> {
  const map = new Map<string, Attachment[]>();
  if (ids.length === 0) return map;
  const rows = await db
    .select({
      targetId: fileAttachments.targetId,
      attachmentId: fileAttachments.id,
      fileId: files.id,
      originalName: files.originalName,
      mimeType: files.mimeType,
      sizeBytes: files.sizeBytes,
      label: fileAttachments.label,
      notes: fileAttachments.notes,
    })
    .from(fileAttachments)
    .innerJoin(files, eq(files.id, fileAttachments.fileId))
    .where(
      and(
        eq(fileAttachments.targetType, targetType),
        inArray(fileAttachments.targetId, ids),
        eq(files.status, "ready")
      )
    )
    .orderBy(desc(fileAttachments.createdAt));
  for (const r of rows) {
    const list = map.get(r.targetId) ?? [];
    list.push({
      attachmentId: r.attachmentId,
      fileId: r.fileId,
      originalName: r.originalName,
      mimeType: r.mimeType,
      sizeBytes: r.sizeBytes,
      label: r.label,
      notes: r.notes,
    });
    map.set(r.targetId, list);
  }
  return map;
}

export async function listAttachments(
  targetType: AttachTarget,
  targetId: string
): Promise<Attachment[]> {
  return db
    .select({
      attachmentId: fileAttachments.id,
      fileId: files.id,
      originalName: files.originalName,
      mimeType: files.mimeType,
      sizeBytes: files.sizeBytes,
      label: fileAttachments.label,
      notes: fileAttachments.notes,
    })
    .from(fileAttachments)
    .innerJoin(files, eq(files.id, fileAttachments.fileId))
    .where(
      and(
        eq(fileAttachments.targetType, targetType),
        eq(fileAttachments.targetId, targetId),
        eq(files.status, "ready")
      )
    )
    .orderBy(desc(fileAttachments.createdAt));
}
