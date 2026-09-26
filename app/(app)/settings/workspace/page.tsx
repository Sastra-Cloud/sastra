import { WorkspaceBrandingCard } from "@/components/settings/workspace-branding-card";
import { WorkspaceSettingsForm } from "@/components/settings/workspace-settings-form";
import { InvoiceSequenceCard } from "@/components/settings/invoice-sequence-card";
import { HostedPlanCard } from "@/components/settings/hosted-plan-card";
import { requireRole } from "@/lib/auth/guards";
import { seatUsage } from "@/lib/hosted/entitlements";
import { hostedAccountUrl, isHostedInstance } from "@/lib/hosted/mode";
import { storageUsage } from "@/lib/hosted/storage-usage";
import { getInvoiceSequenceSettings, getWorkspaceSettings } from "@/lib/workspace/queries";

export const metadata = { title: "Workspace settings" };
export const dynamic = "force-dynamic";

export default async function WorkspaceSettingsPage() {
  await requireRole("admin");
  const hosted = isHostedInstance();
  const [workspace, invoiceSequence, seats, storage] = await Promise.all([
    getWorkspaceSettings(),
    getInvoiceSequenceSettings(),
    hosted ? seatUsage() : null,
    hosted ? storageUsage() : null,
  ]);
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Organization-wide defaults</p>
        <h2 className="font-heading text-2xl font-semibold">{workspace.orgName ?? "Workspace"}</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">Define how Sastra recognizes your organization and seeds new publishing work. Existing project overrides remain untouched.</p>
      </div>
      {seats && storage ? (
        <HostedPlanCard
          people={seats.activeHumans + seats.pendingInvites}
          peopleLimit={seats.limit}
          usedBytes={storage.usedBytes}
          limitBytes={storage.limitBytes}
          accountUrl={hostedAccountUrl()}
        />
      ) : null}
      <WorkspaceBrandingCard
        settings={{
          logoFileId: workspace.logoFileId,
          accentColor: workspace.accentColor,
          orgName: workspace.orgName,
          orgAliases: workspace.orgAliases,
          internalEmailDomains: workspace.internalEmailDomains,
          preparedByNote: workspace.preparedByNote,
        }}
      />
      <WorkspaceSettingsForm settings={workspace} />
      <InvoiceSequenceCard sequence={invoiceSequence} />
    </div>
  );
}
