"use server";

import { and, eq, inArray } from "drizzle-orm";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { emailMessages, emailThreadProjects, fileAttachments, files, printRuns } from "@/lib/db/schema";
import { createImportFromFile } from "@/lib/imports/actions";
import { createQuoteFromFile } from "@/lib/print/actions";
import { startManualEmailRightsReview } from "./rights-review-actions";

export async function reviewEmailAttachmentAsDocument(
  threadId: string,
  attachmentId: string,
  workflow: "project_document" | "rights_agreement" | "rights_receipt" | "print_quote"
) {
  await requireRole("manager");
  const [attachment] = await db.select({ fileId: files.id, mimeType: files.mimeType })
    .from(fileAttachments)
    .innerJoin(emailMessages, eq(emailMessages.id, fileAttachments.targetId))
    .innerJoin(files, eq(files.id, fileAttachments.fileId))
    .where(and(eq(fileAttachments.id, attachmentId), eq(fileAttachments.targetType, "email_message"),
      eq(emailMessages.threadId, threadId), eq(files.status, "ready"))).limit(1);
  if (!attachment) return { error: "This attachment is no longer available." };
  if (workflow === "project_document") {
    const result = await createImportFromFile(attachment.fileId);
    return result.error ? { error: result.error } : { importId: result.importId };
  }
  if (workflow === "rights_agreement" || workflow === "rights_receipt") {
    const result = await startManualEmailRightsReview(threadId, attachmentId,
      workflow === "rights_agreement" ? "signed_agreement" : "license_fee_receipt");
    return result.error ? { error: result.error } : {};
  }
  if (attachment.mimeType !== "application/pdf" && !attachment.mimeType.startsWith("image/")) {
    return { error: "Choose a PDF or image for print quote review." };
  }
  const projectLinks = await db.select({ projectId: emailThreadProjects.projectId })
    .from(emailThreadProjects).where(eq(emailThreadProjects.threadId, threadId));
  const projectIds = projectLinks.map((row) => row.projectId);
  if (!projectIds.length) return { error: "Link this email to a project first." };
  const runs = await db.select({ id: printRuns.id }).from(printRuns)
    .where(inArray(printRuns.projectId, projectIds)).limit(2);
  if (runs.length !== 1) return { error: "Choose the print run on the project's Print page, then upload this quote there." };
  const result = await createQuoteFromFile(runs[0].id, attachment.fileId);
  return result.error ? { error: result.error } : {};
}
