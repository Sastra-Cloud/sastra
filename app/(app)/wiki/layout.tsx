import { WikiWorkspace } from "@/components/wiki/wiki-workspace";
import { requireUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/policy";
import { getWikiTree } from "@/lib/wiki/queries";

export const dynamic = "force-dynamic";

export default async function WikiLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  const tree = await getWikiTree(user.role);
  return (
    <WikiWorkspace tree={tree} canEdit={can(user, "wiki.edit")}>
      {children}
    </WikiWorkspace>
  );
}
