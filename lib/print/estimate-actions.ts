"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { fileAttachments, printContacts, printRuns } from "@/lib/db/schema";
import { getAccessibleExtractionFile } from "@/lib/imports/file-access";
import { createPrintRun, draftPrintRfq } from "./actions";
import {
  BUDGET_ESTIMATE_KIND,
  MAX_REFERENCE_PDF_BYTES,
} from "./estimate-policy";
import { saveEmailDraftForUser } from "@/lib/email/draft-store";
import { getOrCreatePrintSettings } from "./queries";

const requestSchema = z.object({
  contactId: z.uuid(),
  referenceFileId: z.uuid().nullable(),
  pageCount: z.number().int().min(1).max(10000),
  trimWidthIn: z.number().min(1).max(20).optional(),
  trimHeightIn: z.number().min(1).max(20).optional(),
  quantities: z.array(z.number().int().min(1).max(10000000)).min(1).max(12),
  textPaper: z.string().max(500),
  coverPaper: z.string().max(500),
  binding: z.string().max(300),
  notes: z.string().max(2000),
});

/** Preparing and saving a request is separate from explicitly sending it. */
export async function draftPrintEstimate(
  projectId: string,
  input: z.input<typeof requestSchema>,
) {
  const { user } = await requireRole("manager");
  const data = requestSchema.parse(input);
  const [contact] = await db
    .select()
    .from(printContacts)
    .where(
      and(
        eq(printContacts.id, data.contactId),
        eq(printContacts.isActive, true),
      ),
    )
    .limit(1);
  if (!contact?.email)
    return { error: "Choose an active printer with an email address." };
  const file = data.referenceFileId
    ? await getAccessibleExtractionFile(data.referenceFileId, user.id)
    : null;
  if (
    data.referenceFileId &&
    (!file ||
      file.mimeType !== "application/pdf" ||
      file.sizeBytes > MAX_REFERENCE_PDF_BYTES)
  ) {
    return { error: "Choose an accessible English PDF up to 15 MB." };
  }
  const created = await createPrintRun(projectId, {
    kind: BUDGET_ESTIMATE_KIND,
    ...data,
    requestedQuantities: [...new Set(data.quantities)],
  });
  if ("error" in created)
    return { error: created.error || "Could not create the request." };
  await db
    .update(printRuns)
    .set({
      referenceFileId: file?.id ?? null,
      quotedTextPages: data.pageCount,
      printNumber: null,
    })
    .where(eq(printRuns.id, created.id));
  if (file)
    await db.insert(fileAttachments).values({
      fileId: file.id,
      targetType: "project",
      targetId: projectId,
      label: "English reference PDF",
    });
  const draft = await draftPrintRfq(created.id);
  if ("error" in draft)
    return { error: draft.error || "Could not prepare the email." };
  const settings = await getOrCreatePrintSettings(projectId);
  const saved = await saveEmailDraftForUser(user.id, {
    projectId,
    kind: "print_rfq",
    contextId: created.id,
    toAddresses: [contact.email],
    ccAddresses: settings.ccEmails ?? [],
    subject: draft.subject,
    body: draft.body,
    baselineSubject: draft.subject,
    baselineBody: draft.body,
  });
  return {
    draft: saved,
    runId: created.id,
    referenceFileId: file?.id ?? null,
    attachment: file
      ? {
          name: file.originalName,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          previewUrl: `/api/files/${file.id}/download`,
        }
      : null,
  };
}
