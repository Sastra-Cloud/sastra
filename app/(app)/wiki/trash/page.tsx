import { Trash2 } from "lucide-react";

import { PageHero, PageShell } from "@/components/cockpit";
import { WikiTrash } from "@/components/wiki/wiki-trash";
import { requireRole } from "@/lib/auth/guards";
import { getTrashedWikiPages } from "@/lib/wiki/queries";

export const metadata = { title: "Wiki trash" };

export default async function WikiTrashPage() {
  await requireRole("manager");
  const pages = await getTrashedWikiPages();
  return <PageShell><PageHero icon={<Trash2 className="size-6" />} eyebrow="Wiki management" title="Trash" description="Restore pages that were removed from the wiki." /><WikiTrash pages={pages} /></PageShell>;
}
