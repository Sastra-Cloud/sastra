import "server-only";

import { asc, desc } from "drizzle-orm";

import { db } from "@/lib/db";
import { partnerContacts, partners } from "@/lib/db/schema";

export type Partner = typeof partners.$inferSelect;
export type PartnerContact = typeof partnerContacts.$inferSelect;

/** Flat org + contact arrays (joined by partnerId in the UI), primary first. */
export async function listPartnersWithContacts(): Promise<{
  partners: Partner[];
  contacts: PartnerContact[];
}> {
  const [orgs, contacts] = await Promise.all([
    db.select().from(partners).orderBy(asc(partners.name)),
    db
      .select()
      .from(partnerContacts)
      .orderBy(
        desc(partnerContacts.isPrimary),
        asc(partnerContacts.firstName),
        asc(partnerContacts.lastName)
      ),
  ]);
  return { partners: orgs, contacts };
}

export function partnerContactName(
  contact: Pick<PartnerContact, "firstName" | "lastName">
): string {
  return [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
}
