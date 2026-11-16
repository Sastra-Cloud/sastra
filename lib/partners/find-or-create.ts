import "server-only";

import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { partnerContacts, partners } from "@/lib/db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Find or create a partner in the saved directory, and one contact when a name
 * or email is known. Idempotent by organization name and by contact email (or
 * full name when there is no email), so repeating it never duplicates a row.
 */
export async function findOrCreatePartnerContact(
  tx: Tx,
  input: {
    org: string;
    partnerId?: string | null;
    partnerContactId?: string | null;
    website?: string | null;
    billingAddress?: string | null;
    notes?: string | null;
    createdBy?: string;
    contactName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    role?: string | null;
  }
): Promise<{ partnerId: string; partnerContactId: string | null }> {
  const org = input.org.trim();
  if (!org) throw new Error("Enter a partner name.");
  // Serialize all directory creation paths, including simultaneous proposal saves.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`partner-name:${org.toLowerCase()}`}))`);
  const matches = await tx
    .select()
    .from(partners)
    .where(sql`lower(trim(${partners.name})) = ${org.toLowerCase()}`);
  const existing = matches.find((partner) => partner.id === input.partnerId) ?? matches[0];
  const details = {
    website: input.website?.trim() || null,
    billingAddress: input.billingAddress?.trim() || null,
    notes: input.notes?.trim() || null,
  };
  const partnerId =
    existing?.id ??
    (
      await tx.insert(partners).values({ name: org, ...details, createdBy: input.createdBy }).returning({
        id: partners.id,
      })
    )[0].id;
  // A project may fill gaps, but must not overwrite another project's directory edits.
  if (existing) {
    const missing = Object.fromEntries(Object.entries(details).filter(([key, value]) =>
      value && !existing[key as keyof typeof details]?.trim(),
    ));
    if (Object.keys(missing).length) await tx.update(partners)
      .set({ ...missing, updatedAt: new Date() }).where(eq(partners.id, partnerId));
  }

  const parts = (input.contactName?.trim() ?? "").split(/\s+/).filter(Boolean);
  const firstName = input.firstName?.trim() || parts[0] || null;
  const lastName = input.lastName?.trim() || (parts.length > 1 ? parts.slice(1).join(" ") : null);
  const contactName = [firstName, lastName].filter(Boolean).join(" ");
  const email = input.email?.trim() || null;
  const phone = input.phone?.trim() || null;
  const role = input.role?.trim() || null;
  const hasDetails = Boolean(contactName || email || phone || role);
  if (!hasDetails && !input.partnerContactId) return { partnerId, partnerContactId: null };

  const contacts = await tx
    .select()
    .from(partnerContacts)
    .where(eq(partnerContacts.partnerId, partnerId));
  const same = (a: string | null, b: string) => a?.trim().toLowerCase() === b.toLowerCase();
  const sameName = (contact: typeof partnerContacts.$inferSelect) => Boolean(contactName) &&
    same([contact.firstName, contact.lastName].filter(Boolean).join(" "), contactName);
  const matchesContact = (contact: typeof partnerContacts.$inferSelect) => email
    ? same(contact.email, email)
    : contactName
      ? sameName(contact)
      : phone ? same(contact.phone, phone) : role ? same(contact.role, role) : !hasDetails;
  const dupe = contacts.find((contact) => contact.id === input.partnerContactId && matchesContact(contact))
    ?? contacts.find(matchesContact)
    ?? (email ? contacts.find((contact) => !contact.email?.trim() && sameName(contact)) : undefined);
  if (dupe) {
    const missing = Object.fromEntries(Object.entries({ firstName, lastName, email, phone, role })
      .filter(([key, value]) => value && !dupe[key as "firstName" | "lastName" | "email" | "phone" | "role"]?.trim()));
    if (Object.keys(missing).length) await tx.update(partnerContacts)
      .set({ ...missing, updatedAt: new Date() }).where(eq(partnerContacts.id, dupe.id));
    return { partnerId, partnerContactId: dupe.id };
  }
  if (!hasDetails) return { partnerId, partnerContactId: null };

  const [inserted] = await tx
    .insert(partnerContacts)
    .values({
      partnerId,
      firstName,
      lastName,
      email,
      phone,
      role,
      isPrimary: contacts.length === 0,
    })
    .returning({ id: partnerContacts.id });
  return { partnerId, partnerContactId: inserted.id };
}
