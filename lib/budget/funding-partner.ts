import "server-only";

import { and, desc, eq, isNull, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  documentImports,
  mouPayments,
  rightsContacts,
  rightsHolders,
  rightsItems,
} from "@/lib/db/schema";
import { listPartnersWithContacts } from "@/lib/partners/queries";

import {
  importedParty,
  pickAgreementFundingPartner,
  type FundingPartnerFields,
  type SavedPartner,
} from "./funding-partner-pick";

type PartnerDirectory = Awaited<ReturnType<typeof listPartnersWithContacts>>;

/**
 * An import writes its payment schedule in the same transaction that commits
 * it, so its payments carry the commit time. Allow for a slow transaction.
 */
const SAME_COMMIT_MS = 2 * 60_000;

function savedPartners(directory: PartnerDirectory): SavedPartner[] {
  return directory.partners.map((partner) => ({
    id: partner.id,
    name: partner.name,
    billingAddress: partner.billingAddress,
    contacts: directory.contacts
      .filter((contact) => contact.partnerId === partner.id)
      .map((contact) => ({
        id: contact.id,
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        isPrimary: contact.isPrimary,
      })),
  }));
}

/**
 * The partner named by the project's signed agreement, for a project whose
 * Budget has no partner saved. Read-only: the Budget page shows it and invoice
 * generation bills it, so both always agree. The agreement import that set up
 * the expected payments names the payer; without one, the agreement holder on
 * Rights is used. Call it only when the project has money promised to it; a
 * license with no funding names a rights holder, not a partner.
 */
export async function resolveAgreementFundingPartner(
  projectId: string,
  directory?: PartnerDirectory
): Promise<FundingPartnerFields | null> {
  const [rights] = await db
    .select({
      agreementType: rightsItems.agreementType,
      mouHolderId: rightsItems.mouHolderId,
      mouContactId: rightsItems.mouContactId,
      licenseHolderId: rightsItems.licenseHolderId,
      licenseContactId: rightsItems.licenseContactId,
    })
    .from(rightsItems)
    .where(eq(rightsItems.projectId, projectId))
    .limit(1);
  const licenseOnly = rights?.agreementType === "license_only";
  const holderId = licenseOnly ? rights?.licenseHolderId : rights?.mouHolderId;
  const contactId = licenseOnly ? rights?.licenseContactId : rights?.mouContactId;

  const [[holder], [contact], importRows, paymentRows, partnerDirectory] = await Promise.all([
    holderId
      ? db
          .select({ name: rightsHolders.name })
          .from(rightsHolders)
          .where(eq(rightsHolders.id, holderId))
          .limit(1)
      : Promise.resolve([]),
    contactId
      ? db
          .select({
            name: rightsContacts.name,
            email: rightsContacts.email,
            phone: rightsContacts.phone,
          })
          .from(rightsContacts)
          .where(eq(rightsContacts.id, contactId))
          .limit(1)
      : Promise.resolve([]),
    db
      .select({
        extraction: documentImports.extraction,
        reviewed: documentImports.reviewed,
        committedAt: documentImports.committedAt,
      })
      .from(documentImports)
      .where(
        and(
          eq(documentImports.status, "committed"),
          or(
            eq(documentImports.targetProjectId, projectId),
            sql`${projectId}::uuid = any(${documentImports.committedProjectIds})`
          )
        )
      )
      .orderBy(desc(documentImports.committedAt))
      .limit(5),
    db
      .select({ createdAt: mouPayments.createdAt })
      .from(mouPayments)
      .where(and(eq(mouPayments.projectId, projectId), isNull(mouPayments.sharedMouGroupId))),
    directory ? Promise.resolve(directory) : listPartnersWithContacts(),
  ]);
  const scheduledPayments = (committedAt: Date | null) =>
    committedAt !== null &&
    paymentRows.some(
      (payment) => Math.abs(payment.createdAt.getTime() - committedAt.getTime()) <= SAME_COMMIT_MS
    );

  return pickAgreementFundingPartner({
    holderName: holder?.name ?? null,
    holderContact: contact ?? null,
    imports: importRows.flatMap((row) => {
      const party = importedParty(row.reviewed ?? row.extraction);
      return party ? [{ ...party, scheduledPayments: scheduledPayments(row.committedAt) }] : [];
    }),
    savedPartners: savedPartners(partnerDirectory),
  });
}
