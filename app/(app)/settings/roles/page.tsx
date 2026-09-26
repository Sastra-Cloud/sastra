import { requireRole } from "@/lib/auth/guards";
import { listAllProjectRoles } from "@/lib/team/queries";
import { RolesManager } from "@/components/settings/roles-manager";

export const metadata = { title: "Project roles" };
export const dynamic = "force-dynamic";

export default async function RolesSettingsPage() {
  await requireRole("manager");
  const roles = await listAllProjectRoles();
  return <RolesManager roles={roles} />;
}
