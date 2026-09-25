import { CircleHelp } from "lucide-react";

import { ContentColumn, PageHero, PageShell } from "@/components/cockpit";
import { HelpBrowser } from "@/components/help/help-browser";
import { getHelpDocs } from "@/lib/help/content";

export const metadata = { title: "Help" };

export default function HelpPage() {
  const docs = getHelpDocs();

  return (
    <PageShell>
      <div id="help-top" className="scroll-mt-20">
        <PageHero
          icon={<CircleHelp className="size-6" />}
          eyebrow="Reference"
          title="Help & user guide"
          description={
            <>
              How each part of Sastra works. Search below, or ask the Sastra
              Assistant a question — it answers from this same documentation. Look
              for the{" "}
              <CircleHelp className="inline size-4 align-text-bottom" /> icons
              around the app for in-context tips.
            </>
          }
        />
      </div>

      <ContentColumn width="reading">
        <HelpBrowser docs={docs} />
      </ContentColumn>
    </PageShell>
  );
}
