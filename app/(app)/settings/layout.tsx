import { Settings2 } from "lucide-react";

import { requireUser } from "@/lib/auth/guards";
import { PageHero, PageShell } from "@/components/cockpit";
import { SettingsNav } from "@/components/settings/settings-nav";
import { canManage, isAdminRole } from "@/lib/auth/policy";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireUser();
  const isAdmin = isAdminRole(user);
  const hasManagementAccess = canManage(user);

  return (
    <PageShell>
      <PageHero
        icon={<Settings2 className="size-6" />}
        eyebrow="Workspace controls"
        title="Settings"
        description="Tune account details, team access, publishing defaults, rituals, notifications, and AI support from one operational cockpit."
      />
      <div className="grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-8">
        <SettingsNav canManage={hasManagementAccess} isAdmin={isAdmin} />
        <div className="min-w-0 max-w-4xl">{children}</div>
      </div>
    </PageShell>
  );
}
