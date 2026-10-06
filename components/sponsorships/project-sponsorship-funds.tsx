import Link from "next/link";
import { sponsorshipMoney } from "@/lib/sponsorships/format";
import type { listProjectSponsorshipFunds } from "@/lib/sponsorships/queries";

export function ProjectSponsorshipFunds({ funds }: { funds: Awaited<ReturnType<typeof listProjectSponsorshipFunds>> }) {
  if (!funds.length) return null;
  return <section aria-labelledby="project-sponsorship-funds" className="space-y-3 rounded-xl border bg-card p-4 md:p-5">
    <div className="space-y-1"><h2 id="project-sponsorship-funds" className="text-base font-semibold">Sponsorship funds</h2>
      <p className="text-sm text-muted-foreground">Money available for this book, with a separate record of each amount used.</p></div>
    <ul className="divide-y border-y">{funds.map(fund => <li key={fund.id} className="space-y-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><div className="min-w-0"><p className="break-words text-sm font-medium">{fund.title}</p><p className="text-xs text-muted-foreground">{fund.recipientName}</p></div>
        <Link href={`/sponsorships/${fund.id}#sponsorship-funds`} className="inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4">View funds and record use</Link></div>
      <dl className="grid gap-3 text-sm sm:grid-cols-3"><div><dt className="text-muted-foreground">Received</dt><dd className="tabular-nums">{sponsorshipMoney(fund.received, fund.currency)}</dd></div><div><dt className="text-muted-foreground">Used</dt><dd className="tabular-nums">{sponsorshipMoney(fund.used, fund.currency)}</dd></div><div><dt className="text-muted-foreground">Available</dt><dd className="font-semibold tabular-nums">{sponsorshipMoney(fund.available, fund.currency)}</dd></div></dl>
    </li>)}</ul>
  </section>;
}
