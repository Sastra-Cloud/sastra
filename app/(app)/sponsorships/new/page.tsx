import Link from "next/link";
import { requireRole } from "@/lib/auth/guards";
import { getWorkspaceSettings } from "@/lib/workspace/queries";
import { moduleEnabled } from "@/lib/workspace/modules";
import { listSponsorshipBooks } from "@/lib/sponsorships/queries";
import { listPartnersWithContacts } from "@/lib/partners/queries";
import { ContentColumn, PageHero, PageShell } from "@/components/cockpit";
import { CreateSponsorship } from "@/components/sponsorships/create-sponsorship";

export const metadata = { title: "Create sponsorship" };
export const dynamic = "force-dynamic";

export default async function NewSponsorshipPage() {
  await requireRole("manager");
  const workspace = await getWorkspaceSettings();
  if (!moduleEnabled(workspace.enabledModules, "sponsorships")) return null;
  const [books, directory] = await Promise.all([listSponsorshipBooks(), listPartnersWithContacts()]);
  return <PageShell className="pb-16"><PageHero title="Create sponsorship" description="Choose books and agreed prices. You can review the invoice before sending." />
    <ContentColumn><Link href="/sponsorships" className="mb-4 inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4">Back to sponsorships</Link>
      <CreateSponsorship currency={workspace.defaultCurrency} options={{ books,
        partners: directory.partners.map(({ id, name, billingAddress }) => ({ id, name, billingAddress })),
        contacts: directory.contacts.map(({ id, partnerId, firstName, lastName, email, isPrimary }) => ({ id, partnerId, firstName, lastName, email, isPrimary })),
      }} />
    </ContentColumn></PageShell>;
}
