import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { canManage } from "@/lib/auth/policy";
import { canAccessFile } from "@/lib/chat/access";
import { db } from "@/lib/db";
import { emailMessages, fileAttachments, files, user } from "@/lib/db/schema";

/** Recheck persisted authority, including for jobs running after the request. */
export async function getAccessibleExtractionFile(fileId: string, actorId: string) {
  const [row] = await db
    .select({ file: files, role: user.role, isActive: user.isActive })
    .from(files)
    .innerJoin(user, eq(user.id, actorId))
    .where(eq(files.id, fileId))
    .limit(1);
  if (!row || row.isActive !== true || !canManage(row.role) ||
    row.file.status !== "ready" || row.file.purpose === "donation_import" ||
    !(await canAccessFile(fileId, actorId))) return null;
  return row.file;
}

/**
 * System email intake has no user. Its authority is the persisted attachment
 * on the exact source message/thread, never just a file ID or a null creator.
 * Older captured attachments use the default workspace_attachment purpose.
 */
export async function getEmailExtractionFile(
  fileId: string,
  sourceMessageId: string,
  sourceThreadId: string
) {
  const [row] = await db
    .select({ file: files })
    .from(files)
    .innerJoin(fileAttachments, and(
      eq(fileAttachments.fileId, files.id),
      eq(fileAttachments.targetType, "email_message"),
      eq(fileAttachments.targetId, sourceMessageId)
    ))
    .innerJoin(emailMessages, and(
      eq(emailMessages.id, fileAttachments.targetId),
      eq(emailMessages.threadId, sourceThreadId)
    ))
    .where(and(
      eq(files.id, fileId),
      eq(files.status, "ready"),
      inArray(files.purpose, ["workspace_attachment", "email_ingest"])
    ))
    .limit(1);
  return row?.file ?? null;
}
