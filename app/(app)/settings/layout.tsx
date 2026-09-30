import { requireUser } from "@/lib/auth/guards";
import { PageShell } from "@/components/cockpit";
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
      <header className="space-y-1">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Find personal preferences and shared workspace settings.</p>
      </header>
      <div className="grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-8">
        <SettingsNav canManage={hasManagementAccess} isAdmin={isAdmin} />
        <div className="min-w-0 max-w-4xl">{children}</div>
      </div>
    </PageShell>
  );
}
