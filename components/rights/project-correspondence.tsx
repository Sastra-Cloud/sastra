import Link from "next/link";
import { Mail } from "lucide-react";

import type { ThreadSummary } from "@/lib/email/queries";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_VARIANT = {
  open: "default",
  waiting: "secondary",
  done: "outline",
} as const;

/** Correspondence captured for one project, shown on its Rights tab. */
export function ProjectCorrespondence({ threads }: { threads: ThreadSummary[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="size-4" /> Correspondence
        </CardTitle>
        <CardAction>
          <Link
            href="/correspondence"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            Open inbox
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        {threads.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No email captured for this project yet. Forward to or CC the shared
            mailbox and it’ll show up here.
          </p>
        ) : (
          <ul className="divide-y overflow-hidden rounded-lg border">
            {threads.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/correspondence/${t.id}`}
                  className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-accent/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {t.subject ?? "(no subject)"}
                      </span>
                      <Badge variant={STATUS_VARIANT[t.status]}>{t.status}</Badge>
                    </div>
                    {t.holderName && (
                      <p className="text-xs text-muted-foreground">
                        {t.holderName}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {t.lastMessageAt ? timeAgo(t.lastMessageAt) : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
