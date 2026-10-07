import { LifeBuoy } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHero, PageShell } from "@/components/cockpit";
import { requireUser } from "@/lib/auth/guards";
import { supportConfiguration } from "@/lib/support/config";
import { runningVersion } from "@/lib/ops/version";
import { SupportWorkspace } from "@/components/support/support-workspace";

export const metadata = { title: "Support & requests" };
export default async function SupportPage() {
  const { user } = await requireUser();
  const version = runningVersion();
  return (
    <PageShell>
      <PageHero
        icon={<LifeBuoy className="size-6" />}
        eyebrow="Help"
        title="Support & requests"
        description="Get help with a problem or tell us what would make your work easier."
        actions={
          <Button variant="outline" size="lg" render={<Link href="/help" />}>
            Browse help guides
          </Button>
        }
      />
      <SupportWorkspace
        connected={!!supportConfiguration()}
        userId={user.id}
        version={{ version: version.version, revision: version.revision }}
      />
    </PageShell>
  );
}
