import { cookies } from "next/headers";

import { requireUser } from "@/lib/auth/guards";
import { listManagedProjectIds } from "@/lib/auth/project-access";
import { ProjectManagementProvider } from "@/components/projects/project-management-provider";
import { can, isAdminRole } from "@/lib/auth/policy";
import { getActiveTimer } from "@/lib/tasks/time-queries";
import { AppShell } from "@/components/app-shell";
import { getWorkspaceSettings, workspaceSetupComplete } from "@/lib/workspace/queries";
import { redirect } from "next/navigation";
import { listGuidanceDismissals } from "@/lib/guidance/queries";
import { hasAskedAssistant } from "@/lib/assistant/queries";
import { runningVersion } from "@/lib/ops/version";
import { cleanVersion, sourceUrlFor } from "@/lib/ops/source-url";
import { getNavigationBadgeCounts } from "@/lib/navigation/badge-queries";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireUser();
  const build = runningVersion();
  const workspace = await getWorkspaceSettings();
  if (!workspaceSetupComplete(workspace) && isAdminRole(user)) redirect("/setup");
  const canManage = can(user, "workspace.manage");
  const managedProjectIds = canManage ? [] : await listManagedProjectIds(user.id);
  const cookieStore = await cookies();
  const initialSidebarCollapsed =
    cookieStore.get("sastra-sidebar-collapsed")?.value === "1";
  const guidanceEnabled =
    (user as { guidanceLevel?: string }).guidanceLevel !== "off";
  const [activeTimer, guidanceDismissals, assistantIntroduced, navigationBadges] = await Promise.all([
    getActiveTimer(user.id),
    guidanceEnabled ? listGuidanceDismissals(user.id) : Promise.resolve([]),
    // The assistant tip is coaching too; only check it with guidance on.
    guidanceEnabled ? hasAskedAssistant(user.id) : Promise.resolve(true),
    getNavigationBadgeCounts(user, workspace.timezone),
  ]);

  return (
    <AppShell
      userId={user.id}
      userName={user.name}
      userImage={user.image ?? null}
      role={user.role as string}
      canManage={canManage}
      initialSidebarCollapsed={initialSidebarCollapsed}
      initialActiveTimer={activeTimer}
      guidanceEnabled={guidanceEnabled}
      initialGuidanceDismissals={guidanceDismissals}
      assistantIntroduced={assistantIntroduced}
      sourceUrl={sourceUrlFor(build)}
      versionLabel={cleanVersion(build.version)}
      enabledModules={workspace.enabledModules}
      initialNavigationBadges={navigationBadges}
    >
      <ProjectManagementProvider userId={user.id} role={user.role as string} managedProjectIds={managedProjectIds}>
        {children}
      </ProjectManagementProvider>
    </AppShell>
  );
}
