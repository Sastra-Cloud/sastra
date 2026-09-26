import Link from "next/link";
import { isHostedInstance, hostedAccountUrl } from "@/lib/hosted/mode";
import { isAdminRole } from "@/lib/auth/policy";
export function AiSetupGuidance({ role, manualHref = "/projects/new", manualLabel = "Create a project manually" }: { role: string | null | undefined; manualHref?: string; manualLabel?: string }) {
  const hosted = isHostedInstance();
  return <div className="space-y-2 rounded-lg border bg-muted/30 p-4 text-sm">
    <p>{hosted ? "AI is not ready for this workspace. Contact Sastra Cloud support to finish setup." : "AI is not connected yet. An administrator can add the provider key in Settings → AI."}</p>
    <div className="flex flex-wrap gap-4"><Link href={manualHref} className="text-primary underline">{manualLabel}</Link>
    {hosted && hostedAccountUrl() ? <a href={hostedAccountUrl()!} className="text-primary underline">Manage account</a> : !hosted && isAdminRole(role) ? <Link href="/settings/ai" className="text-primary underline">Set up AI</Link> : null}</div>
  </div>;
}
