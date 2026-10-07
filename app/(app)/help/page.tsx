import { requireUser } from "@/lib/auth/guards";
import { CircleHelp } from "lucide-react";

import { PageHero, PageShell } from "@/components/cockpit";
import { HelpBrowser } from "@/components/help/help-browser";
import { getHelpTopics } from "@/lib/help/content";
import { HelpSupportActions } from "@/components/help/support-actions";
import { supportConfiguration } from "@/lib/support/config";

export const metadata = { title: "Help" };

export default async function HelpPage() {
  await requireUser();

  return (
    <PageShell>
      <div id="help-top" className="scroll-mt-20">
        <PageHero
          icon={<CircleHelp className="size-6" />}
          eyebrow="Reference"
          title="Help & user guide"
          description={
            <>
              Find a guide for the task at hand. You can also ask the Sastra
              Assistant — it uses the same documentation.
            </>
          }
        />
      </div>

      <HelpSupportActions connected={!!supportConfiguration()} />
      <HelpBrowser topics={getHelpTopics()} />
    </PageShell>
  );
}
