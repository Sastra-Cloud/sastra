import "server-only";
import { createHash } from "node:crypto";
import { and, eq, inArray, or, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentImports, projects, user } from "@/lib/db/schema";
import { getObjectBuffer } from "@/lib/r2";
import { runExtraction } from "@/lib/imports/extraction";
import { notify } from "@/lib/notifications";

/** One funding review per source document, even across forwards and rights approvals. */
export async function enqueueFundingReview(input: {
  fileId: string; r2Key: string; threadId: string; messageId: string; projectIds: string[];
}) {
  const fingerprint = createHash("sha256").update(await getObjectBuffer(input.r2Key)).digest("hex");
  const [created] = await db.insert(documentImports).values({
    fileId: input.fileId, fundingSourceKey: fingerprint,
    sourceThreadId: input.threadId, sourceMessageId: input.messageId, status: "parsing",
  }).onConflictDoNothing().returning({ id: documentImports.id });
  const [existing] = created ? [] : await db.select().from(documentImports)
    .where(eq(documentImports.fundingSourceKey, fingerprint)).limit(1);
  if (existing?.status === "committed" || existing?.status === "discarded") return;
  const reviewId = created?.id ?? existing?.id;
  if (!reviewId) return;
  if (created) await runExtraction(reviewId);
  else if (existing?.status !== "extracted") {
    const [claimed] = await db.update(documentImports).set({ status: "parsing", updatedAt: new Date(), error: null })
      .where(and(eq(documentImports.id, reviewId), or(eq(documentImports.status, "failed"),
        and(eq(documentImports.status, "parsing"), lt(documentImports.updatedAt, new Date(Date.now() - 180_000))))))
      .returning({ id: documentImports.id });
    if (!claimed) return;
    await runExtraction(reviewId);
  }
  const [review] = await db.select({ extraction: documentImports.extraction }).from(documentImports)
    .where(eq(documentImports.id, reviewId)).limit(1);
  if (!review?.extraction?.mouPaymentSchedule.length || review.extraction.documentKind !== "agreement" || review.extraction.agreementType === "license_only") return;
  const creators = await db.select({ id: user.id }).from(projects)
    .innerJoin(user, eq(user.id, projects.createdBy))
    .where(and(inArray(projects.id, input.projectIds), eq(user.isActive, true), eq(user.isBot, false),
      inArray(user.role, ["manager", "admin", "super_admin"])));
  for (const id of new Set(creators.map((creator) => creator.id))) {
    await notify({ userId: id, eventKey: `funding-review:${reviewId}`, type: "invoice_ready",
      title: `Review MoU funding: ${review.extraction.documentTitle ?? "Email agreement"}`,
      body: "Map covered projects, verify allocations and installments, and choose the invoice owner.",
      link: `/agreements/review/${reviewId}`, email: false });
  }
}
