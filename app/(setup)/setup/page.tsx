import { redirect } from "next/navigation";
import { Building2, CheckCircle2 } from "lucide-react";

import { Brand } from "@/components/brand";
import { WorkspaceSetupForm } from "@/components/settings/workspace-setup-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireRole } from "@/lib/auth/guards";
import { getWorkspaceSettings, workspaceSetupComplete } from "@/lib/workspace/queries";

export const metadata = { title: "Set up workspace" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const [{ user }, workspace] = await Promise.all([
    requireRole("admin"),
    getWorkspaceSettings(),
  ]);
  if (workspaceSetupComplete(workspace)) redirect("/dashboard");

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,color-mix(in_oklch,var(--brand-orange)_12%,transparent),transparent_36%),var(--background)] px-4 py-8 sm:py-12">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-2xl border bg-card shadow-xl lg:grid-cols-[0.75fr_1.25fr]">
        <aside className="relative overflow-hidden bg-primary px-6 py-8 text-primary-foreground sm:px-10 lg:py-12">
          <div className="relative z-10 space-y-8">
            <Brand className="text-2xl" iconClassName="size-9" />
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-foreground/70">First-run setup</p>
              <h1 className="font-heading text-3xl font-semibold leading-tight sm:text-4xl">Teach Sastra who your team is.</h1>
              <p className="max-w-sm text-sm leading-6 text-primary-foreground/75">
                These defaults keep correspondence, planning, quotations, and invoices accurate from the first project.
              </p>
            </div>
            <ul className="space-y-3 text-sm text-primary-foreground/85">
              {[
                "Recognize teammates and internal domains",
                "Use the right languages, timezone, and currency",
                "Keep every project override explicit",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary-foreground" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <Building2 className="absolute -bottom-12 -right-10 size-56 rotate-[-8deg] text-primary-foreground/5" />
        </aside>
        <section className="px-5 py-7 sm:px-10 sm:py-10">
          <div className="mb-7 space-y-1">
            <h2 className="font-heading text-2xl font-semibold">Workspace essentials</h2>
            <p className="text-sm text-muted-foreground">You can refine print, finance, and invoice defaults later in Settings.</p>
          </div>
          <WorkspaceSetupForm adminEmail={user.email} />
        </section>
      </div>
    </main>
  );
}
