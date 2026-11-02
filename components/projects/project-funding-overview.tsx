import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { formatDate } from "@/lib/format";
import type { ProjectFundingOverview as FundingOverview } from "@/lib/projects/funding-overview";

export function ProjectFundingOverview({ funding, slug }: { funding: FundingOverview; slug: string }) {
  const money = (cents: number, currency: string) => {
    try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100); }
    catch { return `${(cents / 100).toFixed(2)} ${currency}`; }
  };
  const budgetHref = `/projects/${slug}/budget?run=main`;
  const empty = !funding.sources.length && !funding.receipts.length && funding.balances.every(row => !row.neededCents && !row.unlinkedAssignedCents);
  return <section id="project-funding" aria-labelledby="project-funding-heading" className="space-y-5 rounded-xl border bg-card p-4 md:p-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 id="project-funding-heading" className="text-lg font-semibold">Project funding</h2><p className="text-sm text-muted-foreground">Promises, payments, and available funds for the main project budget.</p></div>
      <Link href={`${budgetHref}#cash-reconciliation`} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary">Open funding details<ArrowRight className="size-4" /></Link>
    </header>
    {empty ? <p className="text-sm text-muted-foreground">No budget or funding recorded yet. Add estimated costs, a promised payment, or a receipt in Budget.</p> : <>
      {funding.balances.map(balance => <div key={balance.currency} className="space-y-2">
        {funding.balances.length > 1 ? <h3 className="text-sm font-medium">{balance.currency}</h3> : null}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
          <div><dt className="text-sm text-muted-foreground">Available now</dt><dd className={`text-xl font-semibold tabular-nums ${balance.availableCents < 0 ? "text-destructive" : ""}`}>{money(balance.availableCents, balance.currency)}</dd><p className="text-xs text-muted-foreground">After deductions and recorded spend</p></div>
          <div><dt className="text-sm text-muted-foreground">Received</dt><dd className="text-xl font-semibold tabular-nums">{money(balance.receivedCents, balance.currency)}</dd><p className="text-xs text-muted-foreground">Gross payments and donations</p></div>
          <div><dt className="text-sm text-muted-foreground">Still promised</dt><dd className="text-xl font-semibold tabular-nums">{money(balance.outstandingCents, balance.currency)}</dd><p className="text-xs text-muted-foreground">Not received yet; gross amount</p></div>
          <div><dt className="text-sm text-muted-foreground">Estimated costs</dt><dd className="text-xl font-semibold tabular-nums">{money(balance.neededCents, balance.currency)}</dd><p className="text-xs text-muted-foreground">{money(balance.spentCents, balance.currency)} spent</p></div>
        </dl>
        <p className="text-xs text-muted-foreground">Available now = {money(balance.netReceivedCents, balance.currency)} net received − {money(balance.spentCents, balance.currency)} recorded spend.{balance.unlinkedAssignedCents > 0 ? ` Another ${money(balance.unlinkedAssignedCents, balance.currency)} is assigned on cost lines without a linked funding source; it is not counted as available cash.` : ""}</p>
      </div>)}
      {funding.sources.length ? <div className="space-y-2"><h3 className="text-sm font-semibold">Where funding is promised</h3><ul className="divide-y border-y">{funding.sources.map(source => <li key={`${source.type}-${source.id}`} className="grid gap-2 py-3 sm:flex sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1"><Link href={source.type === "agreement" ? `/agreements/${source.id}` : `${budgetHref}#mou-payment-${source.id}`} className="inline-flex min-h-11 items-center break-words text-sm font-medium text-primary underline underline-offset-4">{source.name}</Link><p className="text-xs text-muted-foreground">{source.type === "agreement" ? "Agreement allocation" : "Scheduled partner payment"}{source.dueDate ? ` · due ${formatDate(source.dueDate)}` : ""}</p>{source.reviewRequired ? <p className="text-xs text-warning">Agreement needs review. Check its allocation before relying on this promise.</p> : null}{source.receiptMissing ? <p className="text-xs text-warning">Marked received, but no matching receipt is linked. Review the payment.</p> : null}</div>
        <dl className="grid grid-cols-3 gap-x-3 gap-y-1 text-sm sm:flex sm:flex-wrap sm:gap-x-6"><div><dt className="text-xs text-muted-foreground">Promised</dt><dd className="tabular-nums">{money(source.promisedCents, source.currency)}</dd></div><div><dt className="text-xs text-muted-foreground">Received</dt><dd className="tabular-nums">{money(source.receivedCents, source.currency)}</dd></div><div><dt className="text-xs text-muted-foreground">Still to come</dt><dd className="tabular-nums">{money(source.outstandingCents, source.currency)}</dd></div></dl>
      </li>)}</ul></div> : null}
      {funding.receipts.length ? <div className="space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Recent money received</h3><Link href={`${budgetHref}#cash-reconciliation`} className="text-sm text-primary underline underline-offset-4">View all receipts ({funding.receipts.length})</Link></div><ul className="divide-y border-y">{funding.receipts.slice(0, 5).map(receipt => <li key={receipt.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><div className="min-w-0"><p className="break-words font-medium">{receipt.source || (receipt.donation ? "Donation" : "Funding received")}</p><p className="text-xs text-muted-foreground">{receipt.donation ? "Donation" : "Payment"}{receipt.receivedDate ? ` · ${formatDate(receipt.receivedDate)}` : ""}</p></div><div className="text-right tabular-nums"><p>{money(Math.round(Number(receipt.amount) * 100), receipt.currency)} received</p><p className="text-xs text-muted-foreground">{money(receipt.netCents, receipt.currency)} after deductions</p></div></li>)}</ul></div> : null}
    </>}
    {funding.sources.some(source => source.reviewRequired) ? <p className="text-sm text-warning">Promised totals include an agreement that needs review.</p> : null}
    <p className="text-xs text-muted-foreground">Reprint budgets and sponsorship funds keep their separate balances. Promised funding is not available cash.</p>
  </section>;
}
