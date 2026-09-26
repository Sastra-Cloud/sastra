import Link from "next/link";
import { FileSignature, Layers3 } from "lucide-react";

import { requireRole } from "@/lib/auth/guards";
import { listSharedMouGroups } from "@/lib/agreements/queries";
import { PageHero, PageShell } from "@/components/cockpit";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Shared MoUs" };
export const dynamic = "force-dynamic";

function money(value: string, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(Number(value));
}

export default async function SharedMouGroupsPage() {
  await requireRole("manager");
  const groups = await listSharedMouGroups();
  return (
    <PageShell className="space-y-5">
      <PageHero
        eyebrow="Projects · Shared agreements"
        icon={<Layers3 className="size-5" />}
        title="Shared MoUs"
      >
        <p className="max-w-2xl text-sm text-muted-foreground">
          Multi-project agreements whose completion, invoices, and receipts are
          managed once across the covered portfolio.
        </p>
      </PageHero>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <FileSignature className="size-9 text-muted-foreground" />
            <div>
              <p className="font-medium">No shared MoUs yet</p>
              <p className="text-sm text-muted-foreground">
                A group is created when a reviewed import has a payment that
                depends on multiple projects completing.
              </p>
            </div>
            <Link href="/projects/import" className="font-medium text-primary underline underline-offset-4">Import a document</Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {groups.map((group) => (
            <Link key={group.id} href={`/agreements/${group.id}`} className="group">
              <Card className="h-full transition-colors group-hover:border-primary/40">
                <CardContent className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="font-heading text-xl font-semibold tracking-tight">
                        {group.name}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {group.counterparty ?? "Counterparty not set"} · signed {formatDate(group.signedDate)}
                      </p>
                    </div>
                    {group.reviewRequired ? (
                      <span className="rounded-full bg-warning/10 px-2 py-1 text-xs font-medium text-warning-text">
                        Review
                      </span>
                    ) : null}
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span>{group.completed} of {group.total} projects complete</span>
                      <span className="font-medium tabular-nums">
                        {money(group.agreementTotal, group.currency)}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-[width]"
                        style={{ width: `${group.total ? (group.completed / group.total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </PageShell>
  );
}
