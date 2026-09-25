import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Mail } from "lucide-react";

import type { ProjectThreadPreview } from "@/lib/email/queries";
import { timeAgo } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STATUS_LABEL = {
  open: "Open",
  waiting: "Waiting",
  done: "Done",
} as const;

const STATUS_VARIANT = {
  open: "secondary",
  waiting: "outline",
  done: "outline",
} as const;

function counterparty(thread: ProjectThreadPreview) {
  return thread.partnerName ?? thread.holderName ?? null;
}

export function ProjectCorrespondencePreview({
  threads,
  projectSlug,
}: {
  threads: ProjectThreadPreview[];
  projectSlug: string;
}) {
  return (
    <section className="space-y-3" aria-labelledby="recent-correspondence-heading">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2
            id="recent-correspondence-heading"
            className="flex items-center gap-2 text-sm font-medium"
          >
            <Mail className="size-4" />
            Recent correspondence
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Newest email threads linked to this project.
          </p>
        </div>
        <Link
          href={`/correspondence?project=${encodeURIComponent(projectSlug)}`}
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "min-h-11 sm:min-h-8"
          )}
        >
          View all
        </Link>
      </div>

      {threads.length === 0 ? (
        <div className="flex items-start gap-3 rounded-xl border border-dashed px-4 py-3">
          <Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">No linked email yet</p>
            <p className="text-xs text-muted-foreground">
              Captured threads will appear here after they are linked to this
              project.
            </p>
          </div>
        </div>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {threads.map((thread) => {
            const inbound = thread.lastDirection === "inbound";
            const direction = inbound
              ? "Received"
              : thread.lastDirection === "outbound"
                ? "Sent"
                : "Email";
            const party = counterparty(thread);

            return (
              <li key={thread.id}>
                <Link
                  href={`/correspondence/${thread.id}`}
                  className="flex min-h-14 flex-col gap-2 px-4 py-3 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:flex-row sm:items-start sm:gap-3"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    {inbound ? (
                      <ArrowDownLeft
                        className="mt-0.5 size-4 shrink-0 text-primary"
                        aria-hidden
                      />
                    ) : (
                      <ArrowUpRight
                        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {thread.subject ?? "(no subject)"}
                      </p>
                      {thread.previewText ? (
                        <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground sm:line-clamp-1">
                          {thread.previewText}
                        </p>
                      ) : null}
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {direction}
                        {party ? ` · ${party}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="ml-7 flex shrink-0 items-center justify-between gap-2 sm:ml-0 sm:flex-col sm:items-end sm:justify-start sm:gap-1">
                    <span className="text-xs text-muted-foreground">
                      {thread.lastMessageAt ? timeAgo(thread.lastMessageAt) : ""}
                    </span>
                    <Badge variant={STATUS_VARIANT[thread.status]}>
                      {STATUS_LABEL[thread.status]}
                    </Badge>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
