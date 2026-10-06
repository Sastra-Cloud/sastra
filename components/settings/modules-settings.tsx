"use client";

import Link from "next/link";
import { Label } from "@/components/ui/label";
import { useWorkspaceModules } from "./workspace-modules-provider";
import { WORKSPACE_MODULES, moduleEnabled } from "@/lib/workspace/modules";

export function ModulesSettings() {
  const { enabledModules, isPending, setModule } = useWorkspaceModules();
  return <div className="divide-y rounded-xl border bg-card">
    {WORKSPACE_MODULES.map(module => {
      const enabled = moduleEnabled(enabledModules, module.key);
      return <section key={module.key} className="space-y-3 p-4 md:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <Label htmlFor={`module-${module.key}`} className="text-base font-semibold">{module.label}</Label>
            <p className="max-w-2xl text-sm text-muted-foreground">{module.description}</p>
          </div>
          <div className="flex min-h-11 min-w-11 items-center justify-center">
            <input type="checkbox" role="switch" id={`module-${module.key}`} className="size-5 accent-primary"
              checked={enabled} disabled={isPending(module.key)}
              onChange={event => setModule({ module: module.key, enabled: event.target.checked })} />
          </div>
        </div>
        <p role="status" className="text-sm text-muted-foreground">{isPending(module.key) ? "Saving module setting…" : enabled ? "Enabled for managers and admins." : "Disabled. Existing invoices and funding history are kept."}</p>
        {enabled && <Link href="/sponsorships" className="text-sm font-medium text-primary underline underline-offset-4">Open sponsorships</Link>}
      </section>;
    })}
  </div>;
}
