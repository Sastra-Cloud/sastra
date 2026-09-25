import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpenText, Edit3 } from "lucide-react";

import { PageShell } from "@/components/cockpit";
import { Button } from "@/components/ui/button";
import { WikiDocumentView } from "@/components/wiki/wiki-document";
import { requireUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/policy";
import type { WikiDocument } from "@/lib/db/schema";
import { extractWikiHeadings } from "@/lib/wiki/content";
import { getPublishedWikiPage } from "@/lib/wiki/queries";

export default async function WikiReaderPage({ params }: { params: Promise<{ subjectSlug: string; pageSlug: string }> }) {
  const { user } = await requireUser();
  const { subjectSlug, pageSlug } = await params;
  const page = await getPublishedWikiPage(subjectSlug, pageSlug);
  if (!page) notFound();
  const document = page.content as WikiDocument;
  const headings = extractWikiHeadings(document);
  const canEdit = can(user, "wiki.edit");

  return (
    <PageShell className="space-y-5">
      {page.hasUnpublishedChanges && canEdit ? (
        <div className="flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span>This published page has newer changes in its private draft.</span>
          <Button nativeButton={false} render={<Link href={`/wiki/${subjectSlug}/${pageSlug}/edit`} />} variant="outline" size="sm"><Edit3 /> Open draft</Button>
        </div>
      ) : null}
      <article className="wiki-reader-paper">
        <header className="border-b px-5 py-7 sm:px-10 sm:py-10">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <BookOpenText className="size-4 text-primary" />
            <Link href="/wiki" className="hover:text-foreground">Wiki</Link>
            <span>/</span>
            <span>{page.subjectTitle}</span>
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="max-w-3xl font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{page.title}</h1>
              {page.summary ? <p className="mt-3 max-w-3xl text-base text-muted-foreground sm:text-lg">{page.summary}</p> : null}
            </div>
            {canEdit ? <Button nativeButton={false} render={<Link href={`/wiki/${subjectSlug}/${pageSlug}/edit`} />} variant="outline"><Edit3 /> Edit draft</Button> : null}
          </div>
          <p className="mt-5 text-xs text-muted-foreground">Published {new Date(page.publishedAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })} · Revision {page.revisionNumber}</p>
        </header>
        <div className="grid gap-8 px-5 py-7 sm:px-10 sm:py-10 xl:grid-cols-[minmax(0,1fr)_13rem]">
          <WikiDocumentView document={document} />
          {headings.length > 1 ? (
            <aside className="order-first xl:order-last">
              <nav aria-label="On this page" className="rounded-xl border bg-muted/20 p-3 xl:sticky xl:top-5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">On this page</p>
                {headings.map((heading) => <a key={heading.id} href={`#${heading.id}`} className={`block rounded-md px-2 py-1.5 text-sm hover:bg-muted ${heading.level === 3 ? "pl-5 text-muted-foreground" : "font-medium"}`}>{heading.text}</a>)}
              </nav>
            </aside>
          ) : null}
        </div>
      </article>
    </PageShell>
  );
}
