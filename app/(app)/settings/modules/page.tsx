import { requireRole } from "@/lib/auth/guards";
import { ModulesSettings } from "@/components/settings/modules-settings";

export const metadata = { title: "Modules" };

export default async function ModulesPage() {
  await requireRole("admin");
  return <div className="space-y-6">
    <div className="space-y-1">
      <h2 className="text-2xl font-semibold">Modules</h2>
      <p className="max-w-2xl text-sm text-muted-foreground">Choose which optional tools your team uses. Disabling a module keeps its records.</p>
    </div>
    <ModulesSettings />
  </div>;
}
