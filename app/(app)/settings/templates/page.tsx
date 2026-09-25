import { asc, eq } from "drizzle-orm";

import { TemplatesManager } from "@/components/settings/templates-manager";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { phaseTemplates, planTemplates, projectRoles, taskTemplates } from "@/lib/db/schema";
import { getWorkspaceSettings } from "@/lib/workspace/queries";

export const metadata = { title: "Project templates" };
export const dynamic = "force-dynamic";

export default async function TemplatesSettingsPage() {
  await requireRole("admin");
  const [templates, phases, tasks, roles, workspace] = await Promise.all([
    db.select().from(planTemplates).orderBy(asc(planTemplates.name)),
    db.select().from(phaseTemplates).orderBy(asc(phaseTemplates.orderIndex)),
    db.select().from(taskTemplates).orderBy(asc(taskTemplates.orderIndex)),
    db.select().from(projectRoles).where(eq(projectRoles.isActive, true)).orderBy(asc(projectRoles.sortOrder)),
    getWorkspaceSettings(),
  ]);
  return <TemplatesManager
    templates={templates.map((template) => ({
      ...template,
      phases: phases.filter((phase) => phase.planTemplateId === template.id).map((phase) => ({
        ...phase,
        tasks: tasks.filter((task) => task.phaseTemplateId === phase.id),
      })),
    }))}
    roles={roles.map(({ id, label }) => ({ id, label }))}
    defaultTemplateKey={workspace.defaultPlanTemplateKey}
  />;
}
