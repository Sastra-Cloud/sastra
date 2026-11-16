import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { projectPartnerQuotations } from "@/lib/db/schema";
import type { PartnerQuotationDTO } from "./partner-quotations";

export async function listPartnerQuotations(
  projectId: string,
  printRunId?: string | null,
): Promise<PartnerQuotationDTO[]> {
  return db
    .select({
      id: projectPartnerQuotations.id,
      title: projectPartnerQuotations.title,
      partnerId: projectPartnerQuotations.partnerId,
      partnerName: projectPartnerQuotations.partnerName,
      contactName: projectPartnerQuotations.contactName,
      contactEmail: projectPartnerQuotations.contactEmail,
      description: projectPartnerQuotations.description,
      currency: projectPartnerQuotations.currency,
      lines: projectPartnerQuotations.lines,
      printOptions: projectPartnerQuotations.printOptions,
      sourceFingerprint: projectPartnerQuotations.sourceFingerprint,
    })
    .from(projectPartnerQuotations)
    .where(
      and(
        eq(projectPartnerQuotations.projectId, projectId),
        printRunId
          ? eq(projectPartnerQuotations.printRunId, printRunId)
          : isNull(projectPartnerQuotations.printRunId),
      ),
    )
    .orderBy(
      asc(projectPartnerQuotations.createdAt),
      asc(projectPartnerQuotations.id),
    );
}
