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
import { logger } from "@/lib/logger";
import { performanceMonitoringEnabled } from "@/lib/observability/performance-intake";

// Coaching and navigation badges are conveniences. They start now, run beside
// the required reads, and stream in after the page is usable. A failure becomes
// `null`, which the shell treats as "not available", never as an error page.
async function loadGuidanceSnapshot(userId: string) {
  try {
    const [dismissedKeys, assistantIntroduced] = await Promise.all([
      listGuidanceDismissals(userId),
      // The assistant tip is coaching too; only check it with guidance on.
      hasAskedAssistant(userId),
    ]);
    return { dismissedKeys, assistantIntroduced };
  } catch (error) {
    logger.error("shell.guidance_unavailable", error);
    return null;
  }
}

async function loadNavigationBadges(
  viewer: Parameters<typeof getNavigationBadgeCounts>[0],
  timeZone: string
) {
  try {
    return await getNavigationBadgeCounts(viewer, timeZone);
  } catch (error) {
    logger.error("shell.badges_unavailable", error);
    return null;
  }
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [{ user }, workspace, cookieStore] = await Promise.all([
    requireUser(),
    getWorkspaceSettings(),
    cookies(),
  ]);
  const build = runningVersion();
  if (!workspaceSetupComplete(workspace) && isAdminRole(user)) redirect("/setup");
  const canManage = can(user, "workspace.manage");
  const initialSidebarCollapsed =
    cookieStore.get("sastra-sidebar-collapsed")?.value === "1";
  const guidanceEnabled =
    (user as { guidanceLevel?: string }).guidanceLevel !== "off";
  // Start the streamed reads first so they overlap the required ones.
  const guidanceSnapshot = guidanceEnabled
    ? loadGuidanceSnapshot(user.id)
    : Promise.resolve({ dismissedKeys: [], assistantIntroduced: true });
  const navigationBadgesSnapshot = loadNavigationBadges(user, workspace.timezone);
  // The timer and project permissions stay authoritative: render waits for them.
  const [activeTimer, managedProjectIds] = await Promise.all([
    getActiveTimer(user.id),
    canManage ? Promise.resolve([]) : listManagedProjectIds(user.id),
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
      guidanceSnapshot={guidanceSnapshot}
      sourceUrl={sourceUrlFor(build)}
      versionLabel={cleanVersion(build.version)}
      enabledModules={workspace.enabledModules}
      navigationBadgesSnapshot={navigationBadgesSnapshot}
      performanceMonitoring={performanceMonitoringEnabled()}
    >
      <ProjectManagementProvider userId={user.id} role={user.role as string} managedProjectIds={managedProjectIds}>
        {children}
      </ProjectManagementProvider>
    </AppShell>
  );
}
