import { requireRole } from "@/lib/auth/guards";
import { listPartnersWithContacts } from "@/lib/partners/queries";
import { PartnersManager } from "@/components/settings/partners-manager";

export const metadata = { title: "Partners" };
export const dynamic = "force-dynamic";

export default async function PartnersSettingsPage() {
  await requireRole("manager");
  const { partners, contacts } = await listPartnersWithContacts();
  return (
    <PartnersManager
      partners={partners.map((p) => ({
        id: p.id,
        name: p.name,
        website: p.website,
        billingAddress: p.billingAddress,
        notes: p.notes,
      }))}
      contacts={contacts.map((c) => ({
        id: c.id,
        partnerId: c.partnerId,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        phone: c.phone,
        role: c.role,
        isPrimary: c.isPrimary,
      }))}
    />
  );
}
