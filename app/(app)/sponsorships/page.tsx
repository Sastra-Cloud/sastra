import Link from "next/link";
import { Plus } from "lucide-react";
import { requireRole } from "@/lib/auth/guards";
import { getWorkspaceSettings } from "@/lib/workspace/queries";
import { moduleEnabled } from "@/lib/workspace/modules";
import { listSponsorships } from "@/lib/sponsorships/queries";
import { PageHero, PageShell } from "@/components/cockpit";
import { buttonVariants } from "@/components/ui/button";
import { SponsorshipList } from "@/components/sponsorships/sponsorship-list";

export const metadata = { title: "Sponsorships" };
export const dynamic = "force-dynamic";

export default async function SponsorshipsPage() {
  await requireRole("manager");
  if (!moduleEnabled((await getWorkspaceSettings()).enabledModules, "sponsorships")) return null;
  const records = await listSponsorships();
  return <PageShell className="pb-16"><PageHero title="Sponsorships" description="Invoice partners for books and track the funding received."
    actions={<Link href="/sponsorships/new" className={buttonVariants()}><Plus className="size-4" />Create sponsorship</Link>} />
    <SponsorshipList records={records} /></PageShell>;
}
