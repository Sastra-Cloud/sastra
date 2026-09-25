import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { requireRole } from "@/lib/auth/guards";
import { listPlanTemplates } from "@/lib/projects/queries";
import { NewProjectEntry } from "@/components/projects/new-project-entry";
import { getWorkspaceSettings } from "@/lib/workspace/queries";
import { ContentColumn, PageShell } from "@/components/cockpit";

export const metadata = { title: "New project" };
export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  await requireRole("manager");
  const [templates, workspace] = await Promise.all([
    listPlanTemplates(),
    getWorkspaceSettings(),
  ]);

  return (
    <PageShell>
      <div>
        <Link
          href="/projects"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Projects
        </Link>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          New project
        </h1>
      </div>
      <ContentColumn width="compact">
        <NewProjectEntry
          templates={templates}
          defaultSourceLanguage={workspace.sourceLanguage}
          defaultTargetLanguage={workspace.targetLanguage}
          defaultPlanTemplateKey={workspace.defaultPlanTemplateKey}
        />
      </ContentColumn>
    </PageShell>
  );
}
