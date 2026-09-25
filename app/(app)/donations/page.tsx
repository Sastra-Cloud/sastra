import { HandCoins } from "lucide-react";

import { PageHero, PageShell } from "@/components/cockpit";
import { DonationImportButton } from "@/components/donations/donation-import-button";
import { DonationsWorkspace } from "@/components/donations/donations-workspace";
import { requireDonationAdmin } from "@/lib/auth/guards";
import { getDonationWorkspace } from "@/lib/donations/queries";

export const metadata = { title: "Donations" };
export const dynamic = "force-dynamic";

export default async function DonationsPage() {
  await requireDonationAdmin();
  const data = await getDonationWorkspace();

  return (
    <PageShell>
      <PageHero
        eyebrow="Finance · Received funding"
        icon={<HandCoins className="size-5" />}
        title="Donations"
        description="Import monthly donation records, prevent duplicates, and confirm which projects received the funding."
        actions={<DonationImportButton />}
      />
      <DonationsWorkspace
        key={data.imports[0]?.id ?? "empty-donation-ledger"}
        data={data}
      />
    </PageShell>
  );
}
