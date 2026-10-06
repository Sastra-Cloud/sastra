"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { EmptyState } from "@/components/cockpit";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import type { SponsorshipListItem } from "@/lib/sponsorships/queries";
import { sponsorshipMoney, sponsorshipStatus } from "@/lib/sponsorships/format";

export function SponsorshipList({ records }: { records: SponsorshipListItem[] }) {
  const [query, setQuery] = useState("");
  const visible = records.filter(record => `${record.title} ${record.recipientName} ${record.invoiceNumber ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  if (!records.length) return <EmptyState title="Create your first sponsorship" description="Choose a partner and books. Review one invoice, then track funding for each project."
    action={<Link href="/sponsorships/new" className={buttonVariants()}>Create sponsorship</Link>} />;
  return <div className="space-y-4">
    <div className="relative max-w-md"><Search aria-hidden className="absolute left-3 top-3 size-4 text-muted-foreground" />
      <Input aria-label="Search sponsorships" placeholder="Search title, partner, or invoice number" value={query} onChange={event => setQuery(event.target.value)} className="min-h-11 pl-9" /></div>
    <ul className="divide-y rounded-xl border bg-card">
      {visible.map(record => <li key={record.id}>
        <Link href={`/sponsorships/${record.id}`} className="flex min-h-24 items-center gap-3 rounded-lg p-4 outline-none hover:bg-muted/35 focus-visible:ring-2 focus-visible:ring-ring sm:gap-6">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="break-words font-semibold">{record.title}</p>
            <p className="break-words text-sm text-muted-foreground">{record.recipientName} · {record.copies.toLocaleString("en-US")} copies{record.invoiceNumber ? ` · Invoice ${record.invoiceNumber}` : ""}</p>
            <Badge variant="secondary">{sponsorshipStatus(record.status, record.invoiceStatus, record.received)}</Badge>
          </div>
          <div className="shrink-0 text-right text-sm tabular-nums">
            <p className="font-semibold">{sponsorshipMoney(record.total, record.currency)}</p>
            {record.status === "invoiced" && <p className="mt-1 text-xs text-muted-foreground">{sponsorshipMoney(Number(record.total) - Number(record.received), record.currency)} due</p>}
          </div>
          <ArrowRight aria-hidden className="hidden size-4 shrink-0 text-muted-foreground sm:block" />
        </Link>
      </li>)}
    </ul>
    {!visible.length && <p role="status" className="py-6 text-sm text-muted-foreground">No sponsorships match your search. Try another name.</p>}
  </div>;
}
