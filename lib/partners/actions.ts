"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";

import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { partnerContacts, partners } from "@/lib/db/schema";

const orgSchema = z.object({
  name: z.string().trim().min(1).max(200),
  website: z.string().trim().max(300).optional(),
  billingAddress: z.string().trim().max(1000).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export async function createPartner(input: z.input<typeof orgSchema>) {
  const { user } = await requireRole("manager");
  const data = orgSchema.parse(input);
  const [row] = await db
    .insert(partners)
    .values({
      name: data.name,
      website: data.website || null,
      billingAddress: data.billingAddress || null,
      notes: data.notes || null,
      createdBy: user.id,
    })
    .returning({ id: partners.id });
  revalidatePath("/settings/partners");
  return { id: row.id };
}

const orgUpdateSchema = orgSchema.partial();

export async function updatePartner(
  id: string,
  input: z.input<typeof orgUpdateSchema>
) {
  await requireRole("manager");
  const data = orgUpdateSchema.parse(input);
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined) set.name = data.name;
  if (data.billingAddress !== undefined) set.billingAddress = data.billingAddress || null;
  if (data.website !== undefined) set.website = data.website || null;
  if (data.notes !== undefined) set.notes = data.notes || null;
  await db.update(partners).set(set).where(eq(partners.id, id));
  revalidatePath("/settings/partners");
  return {};
}

export async function deletePartner(id: string) {
  await requireRole("manager");
  await db.delete(partners).where(eq(partners.id, id));
  revalidatePath("/settings/partners");
  return {};
}

const contactSchema = z.object({
  firstName: z.string().trim().max(120).optional(),
  lastName: z.string().trim().max(120).optional(),
  email: z.string().trim().max(320).optional(),
  phone: z.string().trim().max(60).optional(),
  role: z.string().trim().max(120).optional(),
  isPrimary: z.boolean().optional(),
});

export async function addPartnerContact(
  partnerId: string,
  input: z.input<typeof contactSchema>
) {
  await requireRole("manager");
  const data = contactSchema.parse(input);
  const [row] = await db
    .insert(partnerContacts)
    .values({
      partnerId,
      firstName: data.firstName || null,
      lastName: data.lastName || null,
      email: data.email || null,
      phone: data.phone || null,
      role: data.role || null,
      isPrimary: data.isPrimary ?? false,
    })
    .returning({ id: partnerContacts.id });
  if (data.isPrimary) await makePrimary(row.id, partnerId);
  revalidatePath("/settings/partners");
  return { id: row.id };
}

export async function updatePartnerContact(
  id: string,
  input: z.input<typeof contactSchema>
) {
  await requireRole("manager");
  const data = contactSchema.parse(input);
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (data.firstName !== undefined) set.firstName = data.firstName || null;
  if (data.lastName !== undefined) set.lastName = data.lastName || null;
  if (data.email !== undefined) set.email = data.email || null;
  if (data.phone !== undefined) set.phone = data.phone || null;
  if (data.role !== undefined) set.role = data.role || null;
  await db.update(partnerContacts).set(set).where(eq(partnerContacts.id, id));
  revalidatePath("/settings/partners");
  return {};
}

export async function deletePartnerContact(id: string) {
  await requireRole("manager");
  await db.delete(partnerContacts).where(eq(partnerContacts.id, id));
  revalidatePath("/settings/partners");
  return {};
}

/** Mark a contact as the org's primary, clearing the flag on its siblings. */
async function makePrimary(contactId: string, partnerId: string) {
  await db
    .update(partnerContacts)
    .set({ isPrimary: false, updatedAt: new Date() })
    .where(
      and(
        eq(partnerContacts.partnerId, partnerId),
        ne(partnerContacts.id, contactId)
      )
    );
  await db
    .update(partnerContacts)
    .set({ isPrimary: true, updatedAt: new Date() })
    .where(eq(partnerContacts.id, contactId));
}

export async function setPrimaryPartnerContact(id: string) {
  await requireRole("manager");
  const [contact] = await db
    .select({ partnerId: partnerContacts.partnerId })
    .from(partnerContacts)
    .where(eq(partnerContacts.id, id))
    .limit(1);
  if (!contact) return {};
  await makePrimary(id, contact.partnerId);
  revalidatePath("/settings/partners");
  return {};
}
