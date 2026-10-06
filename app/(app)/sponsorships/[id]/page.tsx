import { notFound } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { getWorkspaceSettings } from "@/lib/workspace/queries";
import { moduleEnabled } from "@/lib/workspace/modules";
import { getSponsorship, listSponsorshipBooks } from "@/lib/sponsorships/queries";
import { listPartnersWithContacts } from "@/lib/partners/queries";
import { PageShell } from "@/components/cockpit";
import { SponsorshipDetail } from "@/components/sponsorships/sponsorship-detail";

export const metadata = { title: "Sponsorship" };
export const dynamic = "force-dynamic";

export default async function SponsorshipPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("manager");
  const workspace = await getWorkspaceSettings();
  if (!moduleEnabled(workspace.enabledModules, "sponsorships")) return null;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [detail, books, directory] = await Promise.all([getSponsorship(id), listSponsorshipBooks(), listPartnersWithContacts()]);
  if (!detail) notFound();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: workspace.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return <PageShell className="pb-16"><SponsorshipDetail detail={detail} defaultCc={workspace.defaultCcEmails} today={today} options={{ books,
    partners: directory.partners.map(({ id, name, billingAddress }) => ({ id, name, billingAddress })),
    contacts: directory.contacts.map(({ id, partnerId, firstName, lastName, email, isPrimary }) => ({ id, partnerId, firstName, lastName, email, isPrimary })),
  }} /></PageShell>;
}
