import Link from "next/link";
import { Inbox, Mail } from "lucide-react";

import { requireRole } from "@/lib/auth/guards";
import { inboxHref, inboxPage } from "@/lib/email/inbox-filters";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { listThreadsPage, type ThreadStatus } from "@/lib/email/queries";
import { getProjectHeader } from "@/lib/projects/queries";
import { correspondenceCaptureEnabled } from "@/lib/gmail";
import { EmptyState, PageHero, PageShell } from "@/components/cockpit";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Correspondence" };
export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<ThreadStatus, "default" | "secondary" | "outline"> = {
  open: "default",
  waiting: "secondary",
  done: "outline",
};

const FILTERS = [
  { key: "project", label: "Project related", href: "/correspondence" },
  { key: "other", label: "Other email", href: "/correspondence?bucket=other" },
  { key: "all", label: "All", href: "/correspondence?bucket=all" },
];

export default async function CorrespondencePage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    needsLinking?: string;
    bucket?: string;
    project?: string;
    q?: string;
    page?: string;
  }>;
}) {
  await requireRole("manager");
  const sp = await searchParams;
  const status = (["open", "waiting", "done"].includes(sp.status ?? "")
    ? sp.status
    : undefined) as ThreadStatus | undefined;
  const bucket =
    sp.needsLinking === "1" || sp.bucket === "other"
      ? "other"
      : sp.bucket === "all"
        ? "all"
        : "project";
  const projectFilter = sp.project
    ? await getProjectHeader(sp.project)
    : null;
  const page = inboxPage(sp.page);
  const filters = { bucket, status, project: sp.project, q: sp.q };
  const { items: threads, hasMore } = await listThreadsPage({
    status,
    projectId: projectFilter?.id,
    projectRelated:
      bucket === "project" ? true : bucket === "other" ? false : undefined,
    search: sp.q,
    page,
  });

  return (
    <PageShell>
      <PageHero
        icon={<Mail className="size-6" />}
        eyebrow="Correspondence"
        title="Project email"
        description="Email captured from the shared mailbox, linked to the projects, publishers, printers, and finance requests it concerns."
      />

      {!correspondenceCaptureEnabled() && (
        <div className="rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          The email hub isn’t connected yet. See{" "}
          <Link href="/settings/email" className="font-medium underline">
            Settings → Email
          </Link>{" "}
          to set it up.
        </div>
      )}

      <form action="/correspondence" className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <input type="hidden" name="bucket" value={bucket} />
        {sp.project ? <input type="hidden" name="project" value={sp.project} /> : null}
        <div className="min-w-0 flex-1 space-y-1"><Label htmlFor="email-search">Search subject or linked project</Label><Input id="email-search" name="q" defaultValue={sp.q ?? ""} /></div>
        <div className="space-y-1"><Label htmlFor="email-status">Status</Label><select id="email-status" name="status" defaultValue={status ?? ""} className="h-9 rounded-md border bg-background px-3 text-sm"><option value="">All statuses</option><option value="open">Open</option><option value="waiting">Waiting</option><option value="done">Done</option></select></div>
        <Button type="submit">Search email</Button>
        {sp.q || sp.status || sp.project ? <Link href={inboxHref({ bucket })} className={buttonVariants({ variant: "ghost" })}>Clear filters</Link> : null}
      </form>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={inboxHref(filters, { bucket: f.key, page: undefined })}
            className={cn(
              buttonVariants({
                variant: bucket === f.key ? "default" : "outline",
                size: "sm",
              })
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {projectFilter ? (
        <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span>
            Showing email linked to{" "}
            <Link
              href={`/projects/${projectFilter.slug}`}
              className="font-medium underline-offset-4 hover:underline"
            >
              {projectFilter.title}
            </Link>
          </span>
          <Link
            href={inboxHref(filters, { project: undefined, page: undefined })}
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "min-h-11 w-fit sm:min-h-8"
            )}
          >
            Clear project filter
          </Link>
        </div>
      ) : null}

      {threads.length === 0 ? (
        <EmptyState
          icon={<Inbox className="size-5" />}
          title={sp.q || sp.status || sp.project ? "No email matches these filters" : "No correspondence here"}
          description={
            sp.q || sp.status || sp.project ? "Change your search or clear filters to see more email." : bucket === "project"
              ? "No project-related email yet. Unlinked mailbox messages stay under Other email."
              : bucket === "other"
                ? "No other mailbox email here. Security alerts and unlinked forwards will appear in this view."
                : "Captured email will appear here as it arrives."
          }
        />
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {threads.map((t) => (
            <li key={t.id}>
              <Link
                href={`/correspondence/${t.id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">
                      {t.subject ?? "(no subject)"}
                    </span>
                    <Badge variant={STATUS_VARIANT[t.status]}>{t.status}</Badge>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    {t.projectTitle ? (
                      <span className="truncate">{t.projectTitle}</span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-500">
                        Unlinked
                      </span>
                    )}
                    {t.holderName && <span>· {t.holderName}</span>}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {t.lastMessageAt ? timeAgo(t.lastMessageAt) : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {page > 1 || hasMore ? <nav aria-label="Email pages" className="flex items-center justify-between gap-3">
        {page > 1 ? <Link href={inboxHref(filters, { page: String(page - 1) })} className={buttonVariants({ variant: "outline" })}>Previous page</Link> : <span />}
        <span className="text-sm text-muted-foreground">Page {page} · up to 50 emails</span>
        {hasMore ? <Link href={inboxHref(filters, { page: String(page + 1) })} className={buttonVariants({ variant: "outline" })}>Next page</Link> : <span />}
      </nav> : null}
    </PageShell>
  );
}
