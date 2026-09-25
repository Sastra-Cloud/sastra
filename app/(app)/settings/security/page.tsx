import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { SecurityManager } from "@/components/settings/security-manager";
import { auth } from "@/lib/auth/auth";
import { isAdminAssured } from "@/lib/auth/assurance";
import { listTrustedBrowsers } from "@/lib/auth/assurance-actions";
import { requireRole } from "@/lib/auth/guards";
import { isSuperAdminRole } from "@/lib/auth/policy";
import { getDatabaseTransportSecurityStatus } from "@/lib/security/database-transport";
import { getDependencySecurityStatus } from "@/lib/security/dependency-monitor";
import { SecurityMonitorStatus } from "@/components/settings/security-monitor-status";
import { dependencySecurityWorkflowConfigured } from "@/lib/security/github-workflow";
import { securityStatusFeedConfigured } from "@/lib/security/status-feed";

export const metadata = { title: "Security settings" };
export const dynamic = "force-dynamic";

export default async function SecuritySettingsPage() {
  const { user } = await requireRole("admin");
  if (!(await isAdminAssured(user.id))) {
    redirect("/security-check?next=%2Fsettings%2Fsecurity");
  }
  const [passkeys, trustedBrowsers, dependencyStatus, databaseStatus] = await Promise.all([
    auth.api.listPasskeys({ headers: await headers() }),
    listTrustedBrowsers(),
    isSuperAdminRole(user)
      ? getDependencySecurityStatus()
      : Promise.resolve(null),
    isSuperAdminRole(user)
      ? getDatabaseTransportSecurityStatus()
      : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Security</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage passkeys and the browsers allowed to open protected admin data.
        </p>
      </div>
      {dependencyStatus && databaseStatus ? (
        <SecurityMonitorStatus
          status={dependencyStatus}
          databaseStatus={databaseStatus}
          checkConfigured={dependencySecurityWorkflowConfigured() || securityStatusFeedConfigured()}
        />
      ) : null}
      <SecurityManager passkeys={passkeys} trustedBrowsers={trustedBrowsers} />
    </div>
  );
}
