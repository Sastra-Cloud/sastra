import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { requireRole } from "@/lib/auth/guards";
import { listPlanTemplates } from "@/lib/projects/queries";
import { listDefaultProjectPeople } from "@/lib/projects/people";
import { NewProjectEntry } from "@/components/projects/new-project-entry";
import { getWorkspaceSettings } from "@/lib/workspace/queries";
import { ContentColumn, PageShell } from "@/components/cockpit";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { lectioConnections } from "@/lib/db/schema";
import { LECTIO_CLOUD_REQUIREMENT, moduleEnabled } from "@/lib/workspace/modules";
import { parseProfile } from "@/lib/lectio/protocol/profile";
import { assertLectioCloudEligibility } from "@/lib/lectio/cloud-eligibility";

export const metadata = { title: "New project" };
export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  const { user } = await requireRole("manager");
  const [templates, workspace, defaultPeople] = await Promise.all([
    listPlanTemplates(),
    getWorkspaceSettings(),
    listDefaultProjectPeople(),
  ]);
  const lectioEnabled = moduleEnabled(workspace.enabledModules, "lectio");
  const lectioEligible = lectioEnabled && await assertLectioCloudEligibility().then(() => true, () => false);
  const connections = lectioEligible
    ? await db.select({ id: lectioConnections.id, teamName: lectioConnections.teamName, profile: lectioConnections.profile, automatic: lectioConnections.autoCreate }).from(lectioConnections).where(and(eq(lectioConnections.state, "active"))) : [];
  const lectioOptions = connections.map(c => {
    try { return { id: c.id, teamName: c.teamName, automatic: c.automatic, templateId: parseProfile(c.profile).planTemplateId }; } catch { return { id: c.id, teamName: c.teamName, automatic: c.automatic, templateId: null }; }
  });

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
        {lectioEnabled && !lectioEligible ? <p className="text-sm text-muted-foreground">{LECTIO_CLOUD_REQUIREMENT}</p> : null}
        <div className="mb-5 space-y-1 rounded-xl border bg-card p-4">
          <h2 className="text-sm font-medium">Project team</h2>
          <p className="text-sm text-muted-foreground">{defaultPeople.length ? `These people will be added automatically: ${defaultPeople.map(person => person.name).join(", ")}.` : "No default project team is set. Add people from the project’s People tab after creating it."}</p>
          <p className="text-xs text-muted-foreground">Work roles are optional. Admins can change the default team in <Link href="/settings/team#default-project-team" className="text-primary underline underline-offset-4">Team settings</Link>.</p>
        </div>
        <NewProjectEntry
          templates={templates}
          defaultSourceLanguage={workspace.sourceLanguage}
          defaultTargetLanguage={workspace.targetLanguage}
          defaultPlanTemplateKey={workspace.defaultPlanTemplateKey}
          lectioOptions={lectioOptions}
          canConfigureLectio={["admin", "super_admin"].includes(user.role ?? "")}
        />
      </ContentColumn>
    </PageShell>
  );
}
