import { notFound } from "next/navigation";

import { PageShell } from "@/components/cockpit";
import { WikiEditor } from "@/components/wiki/wiki-editor";
import { requireRole } from "@/lib/auth/guards";
import type { WikiDocument } from "@/lib/db/schema";
import { getWikiDraftBySlug, getWikiPageMedia, getWikiRevisionHistory } from "@/lib/wiki/queries";
import { getWorkspaceSettings } from "@/lib/workspace/queries";

function bcp47OrEmpty(value: string | null) {
  if (!value) return "";
  try {
    return Intl.getCanonicalLocales(value)[0] ?? "";
  } catch {
    return "";
  }
}

export default async function WikiEditPage({ params }: { params: Promise<{ subjectSlug: string; pageSlug: string }> }) {
  await requireRole("manager");
  const { subjectSlug, pageSlug } = await params;
  const page = await getWikiDraftBySlug(subjectSlug, pageSlug);
  if (!page) notFound();
  const [revisions, workspace, media] = await Promise.all([
    getWikiRevisionHistory(page.id),
    getWorkspaceSettings(),
    getWikiPageMedia(page.id),
  ]);

  return (
    <PageShell>
      <WikiEditor
        page={{
          id: page.id,
          subjectSlug: page.subjectSlug,
          slug: page.slug,
          title: page.title,
          summary: page.summary,
          content: page.content as WikiDocument,
          version: page.version,
          publishedRevisionId: page.publishedRevisionId,
        }}
        revisions={revisions}
        initialMedia={media}
        defaultLanguage={bcp47OrEmpty(workspace.sourceLanguage)}
      />
    </PageShell>
  );
}
