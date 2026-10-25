"use client";

import Link from "next/link";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useWorkspaceModules } from "./workspace-modules-provider";
import { LECTIO_CLOUD_REQUIREMENT, WORKSPACE_MODULES, moduleEnabled } from "@/lib/workspace/modules";

export function ModulesSettings({ lectioAvailable }: { lectioAvailable: boolean }) {
  const { enabledModules, isPending, setModule } = useWorkspaceModules();
  return <div className="divide-y rounded-xl border bg-card">
    {WORKSPACE_MODULES.map(module => {
      const enabled = moduleEnabled(enabledModules, module.key);
      const unavailable = module.key === "lectio" && !lectioAvailable;
      return <section key={module.key} className="space-y-3 p-4 md:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <Label htmlFor={`module-${module.key}`} className="text-base font-semibold">{module.label}</Label>
            <p className="max-w-2xl text-sm text-muted-foreground">{module.description}</p>
          </div>
          <div className="flex min-h-11 min-w-11 items-center justify-center">
            <Switch id={`module-${module.key}`} aria-label={module.label}
              aria-describedby={`module-${module.key}-status`}
              checked={enabled} disabled={isPending(module.key) || (unavailable && !enabled)}
              onCheckedChange={checked => setModule({ module: module.key, enabled: checked })} />
          </div>
        </div>
        <p id={`module-${module.key}-status`} role="status" className="text-sm text-muted-foreground">{isPending(module.key) ? "Saving module setting…" : unavailable ? LECTIO_CLOUD_REQUIREMENT : enabled ? "Enabled for your workspace." : "Disabled. Existing records are kept."}</p>
        {enabled && !unavailable && <Link href={module.key === "lectio" ? "/settings/lectio" : "/sponsorships"} className="text-sm font-medium text-primary underline underline-offset-4">{module.key === "lectio" ? "Manage Lectio connections" : "Open sponsorships"}</Link>}
      </section>;
    })}
  </div>;
}
