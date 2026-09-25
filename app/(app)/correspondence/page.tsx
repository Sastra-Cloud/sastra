import Link from "next/link";
import { Inbox, Mail } from "lucide-react";

import { requireRole } from "@/lib/auth/guards";
import { listThreads, type ThreadStatus } from "@/lib/email/queries";
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
  const threads = await listThreads({
    status,
    projectId: projectFilter?.id,
    projectRelated:
      bucket === "project" ? true : bucket === "other" ? false : undefined,
    limit: 100,
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

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.href}
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
            href="/correspondence"
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
          title="No correspondence here"
          description={
            bucket === "project"
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
    </PageShell>
  );
}
