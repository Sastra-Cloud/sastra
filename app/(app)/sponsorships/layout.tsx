import Link from "next/link";
import { requireRole } from "@/lib/auth/guards";
import { getWorkspaceSettings } from "@/lib/workspace/queries";
import { moduleEnabled } from "@/lib/workspace/modules";
import { isAdminRole } from "@/lib/auth/policy";
import { EmptyState, PageShell } from "@/components/cockpit";
import { buttonVariants } from "@/components/ui/button";

export default async function SponsorshipLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireRole("manager");
  const workspace = await getWorkspaceSettings();
  if (!moduleEnabled(workspace.enabledModules, "sponsorships")) return <PageShell><EmptyState title="Sponsorships is disabled"
    description="An admin can enable this module in Settings → Modules. Existing funding history is kept."
    action={<Link href={isAdminRole(user.role) ? "/settings/modules" : "/dashboard"} className={buttonVariants({ variant: "outline" })}>{isAdminRole(user.role) ? "Open module settings" : "Go to Home"}</Link>} /></PageShell>;
  return children;
}
