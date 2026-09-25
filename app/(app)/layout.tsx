import { cookies } from "next/headers";

import { requireUser } from "@/lib/auth/guards";
import { can, isAdminRole } from "@/lib/auth/policy";
import { getActiveTimer } from "@/lib/tasks/time-queries";
import { AppShell } from "@/components/app-shell";
import { getWorkspaceSettings, workspaceSetupComplete } from "@/lib/workspace/queries";
import { redirect } from "next/navigation";
import { listGuidanceDismissals } from "@/lib/guidance/queries";
import { runningVersion } from "@/lib/ops/version";
import { cleanVersion, sourceUrlFor } from "@/lib/ops/source-url";

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
  const cookieStore = await cookies();
  const initialSidebarCollapsed =
    cookieStore.get("sastra-sidebar-collapsed")?.value === "1";
  const activeTimer = await getActiveTimer(user.id);
  const guidanceEnabled =
    (user as { guidanceLevel?: string }).guidanceLevel !== "off";
  const guidanceDismissals = guidanceEnabled
    ? await listGuidanceDismissals(user.id)
    : [];

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
      sourceUrl={sourceUrlFor(build)}
      versionLabel={cleanVersion(build.version)}
    >
      {children}
    </AppShell>
  );
}
