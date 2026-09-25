import Link from "next/link";
import { BookOpenText, FileText, HardDrive, Search } from "lucide-react";

import { PageHero, PageShell } from "@/components/cockpit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CreatePageDialog,
  CreateSubjectDialog,
} from "@/components/wiki/wiki-workspace";
import { requireUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/policy";
import { getWikiMediaUsage, getWikiTree, searchWiki } from "@/lib/wiki/queries";

export const metadata = { title: "Wiki" };

function formatStorage(bytes: number) {
  const megabytes = bytes / 1024 / 1024;
  return megabytes >= 1024
    ? `${(megabytes / 1024).toFixed(1)} GB`
    : `${megabytes.toFixed(1)} MB`;
}

export default async function WikiPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { user } = await requireUser();
  const canEdit = can(user, "wiki.edit");
  const query = (await searchParams).q?.trim() ?? "";
  const [tree, results, usage] = await Promise.all([
    getWikiTree(user.role),
    query.length >= 2 ? searchWiki(query, user.role) : Promise.resolve([]),
    canEdit ? getWikiMediaUsage() : Promise.resolve(null),
  ]);

  return (
    <PageShell className="space-y-5">
      <PageHero
        icon={<BookOpenText className="size-6" />}
        eyebrow="Shared knowledge"
        title="Wiki"
        description="Private, structured tutorials for the processes your team needs to repeat accurately."
        actions={canEdit ? <CreateSubjectDialog trigger="button" /> : null}
      >
        <form action="/wiki" className="relative max-w-2xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={query} placeholder="Search titles, subjects, and page content…" className="h-11 pl-9" />
        </form>
      </PageHero>

      {query.length > 0 && query.length < 2 ? (
        <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Enter at least two characters to search.</p>
      ) : query.length >= 2 ? (
        <section className="rounded-xl border bg-card p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-heading text-xl font-semibold">Results for “{query}”</h2>
            <span className="text-sm text-muted-foreground">{results.length} found</span>
          </div>
          {results.length === 0 ? (
            <div className="rounded-xl border border-dashed px-5 py-12 text-center text-muted-foreground">No wiki pages match that search.</div>
          ) : (
            <div className="divide-y">
              {results.map((result) => (
                <Link
                  key={`${result.pageId}-${"draft" in result ? result.draft : false}`}
                  href={`/wiki/${result.subjectSlug}/${result.pageSlug}${"draft" in result && result.draft ? "/edit" : ""}`}
                  className="group flex min-h-20 items-start gap-3 py-4 first:pt-0 last:pb-0"
                >
                  <span className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary"><FileText className="size-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-medium group-hover:text-primary">
                      {result.title}
                      {"draft" in result && result.draft ? <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[0.65rem] font-semibold uppercase text-warning-foreground">Draft</span> : null}
                    </span>
                    <span className="mt-0.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">{result.subjectTitle}</span>
                    {result.summary ? <span className="mt-1 line-clamp-2 block text-sm text-muted-foreground">{result.summary}</span> : null}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {tree.map((subject) => (
            <section key={subject.id} className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
              <div className="mb-4 flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-heading text-xl font-semibold text-balance">{subject.title}</h2>
                  {subject.description ? <p className="mt-1 text-sm text-muted-foreground">{subject.description}</p> : null}
                </div>
                {canEdit ? <CreatePageDialog subject={subject} /> : null}
              </div>
              <div className="grid gap-1">
                {subject.pages.length === 0 ? <p className="rounded-lg border border-dashed px-3 py-5 text-center text-sm text-muted-foreground">No pages yet.</p> : subject.pages.map((page) => (
                  <Link key={page.id} href={`/wiki/${subject.slug}/${page.slug}${page.published ? "" : "/edit"}`} className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm hover:bg-muted">
                    <FileText className="size-4 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate font-medium">{page.title}</span>
                    {!page.published ? <span className="text-xs text-warning-foreground">Draft</span> : null}
                  </Link>
                ))}
              </div>
            </section>
          ))}
          {tree.length === 0 ? (
            <div className="col-span-full rounded-xl border border-dashed bg-card px-6 py-16 text-center">
              <BookOpenText className="mx-auto mb-3 size-8 text-muted-foreground" />
              <h2 className="font-heading text-xl font-semibold">Your team wiki is ready</h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{canEdit ? "Use the plus button in the wiki browser to create a subject, then add the first tutorial page." : "A manager can create and publish the first tutorial page."}</p>
            </div>
          ) : null}
        </div>
      )}

      {usage ? (
        <footer className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border bg-card px-4 py-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-2 font-medium text-foreground"><HardDrive className="size-4" /> Private media usage</span>
          <span>{(Number(usage.imageBytes) / 1024 / 1024).toFixed(1)} MB images</span>
          <span>{usage.videoCount} videos</span>
          <span>{formatStorage(Number(usage.videoBytes))} R2 video storage</span>
          <span>{Math.round(Number(usage.videoSeconds) / 60)} minutes of video</span>
          <Button nativeButton={false} render={<Link href="/wiki/trash" />} variant="ghost" size="sm" className="ml-auto">Manage trash</Button>
        </footer>
      ) : null}
    </PageShell>
  );
}
