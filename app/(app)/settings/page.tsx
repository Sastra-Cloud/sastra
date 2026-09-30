import { requireUser } from "@/lib/auth/guards";
import { canManage, isAdminRole } from "@/lib/auth/policy";
import { settingsNavigation } from "@/lib/navigation";
import { SettingsDirectory } from "@/components/settings/settings-directory";

export const metadata = { title: "Find a setting" };

export default async function SettingsIndex() {
  const { user } = await requireUser();
  return <SettingsDirectory groups={settingsNavigation({ canManage: canManage(user), isAdmin: isAdminRole(user) })} />;
}
