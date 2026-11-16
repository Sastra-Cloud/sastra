import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { formatDate } from "@/lib/format";
import type { ProjectFundingOverview as FundingOverview } from "@/lib/projects/funding-overview";

function money(cents: number, currency: string) {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100); }
  catch { return `${currency} ${(cents / 100).toFixed(2)}`; }
}

/** The same financial facts, with detail appropriate to each project screen. */
export function ProjectFundingOverview({ funding, slug, view = "full", title = "Project funding", id = "project-funding", quotation }: {
  funding: FundingOverview;
  slug: string;
  view?: "full" | "summary" | "agreement";
  title?: string;
  id?: string;
  quotation?: { totalCents: number; currency: string };
}) {
  const budgetHref = `/projects/${slug}/budget?run=main`;
  const empty = !funding.sources.length && !funding.receipts.length && !funding.excludedPayments.length && funding.balances.every(row => !row.neededCents && !row.unlinkedAssignedCents);
  const pendingCount = funding.sources.filter(source => source.amountPending).length;
  const unlinked = funding.balances.some(balance => balance.unlinkedReceivedCents > 0);
  return <section id={id} aria-labelledby={`${id}-heading`} className="space-y-4 rounded-xl border bg-card p-4 md:p-5">
    <header className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 id={`${id}-heading`} className="text-base font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{view === "agreement" ? "Funding promised under this project’s agreements, alongside the money received." : "Promises and received money for the main project budget."}</p>
      </div>
      <Link href={`${budgetHref}#agreements-fees`} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary">Review payments<ArrowRight className="size-4" /></Link>
    </header>
    {empty ? <p className="text-sm text-muted-foreground">No funding recorded yet. Add a partner’s expected payment or record money received in Budget.</p> : <>
      {funding.balances.map(balance => {
        const unsettled = balance.amountPendingCount > 0 || balance.unlinkedReceivedCents > 0 || funding.sources.some(source => source.currency === balance.currency && (source.receiptMissing || source.reviewRequired));
        return <div key={balance.currency} className="space-y-3">
          {funding.balances.length > 1 ? <h3 className="text-sm font-medium">{balance.currency}</h3> : null}
          <dl className="grid grid-cols-2 gap-x-5 gap-y-4 xl:grid-cols-4">
            <div><dt className="text-sm text-muted-foreground">Promised funding</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{balance.promisedCents > 0 || !balance.amountPendingCount ? money(balance.promisedCents, balance.currency) : "Amount needed"}</dd><p className="mt-1 text-xs text-muted-foreground">{balance.amountPendingCount ? `${balance.amountPendingCount} payment amount${balance.amountPendingCount === 1 ? " needs" : "s need"} confirmation` : "Total partner commitments, including received payments"}</p></div>
            <div><dt className="text-sm text-muted-foreground">Received</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{money(balance.receivedCents, balance.currency)}</dd><p className="mt-1 text-xs text-muted-foreground">Recorded payments and donations, before deductions</p></div>
            <div><dt className="text-sm text-muted-foreground">Still to come</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{unsettled ? "Needs review" : money(balance.outstandingCents, balance.currency)}</dd><p className="mt-1 text-xs text-muted-foreground">{unsettled ? "Review terms and receipt links to confirm the balance" : "Unpaid part of the recorded commitments"}</p></div>
            <div><dt className="text-sm text-muted-foreground">Available now</dt><dd className={`mt-1 text-lg font-semibold tabular-nums ${balance.availableCents < 0 ? "text-destructive" : ""}`}>{money(balance.availableCents, balance.currency)}</dd><p className="mt-1 text-xs text-muted-foreground">After deductions and recorded spend</p></div>
          </dl>
          <p className="border-t pt-3 text-xs text-muted-foreground">
            {quotation?.currency === balance.currency ? `Partner quotation ${money(quotation.totalCents, balance.currency)}. ` : `Estimated costs ${money(balance.neededCents, balance.currency)}. `}
            {money(balance.netReceivedCents, balance.currency)} net received − {money(balance.spentCents, balance.currency)} spent = {money(balance.availableCents, balance.currency)} available.
            {balance.unlinkedAssignedCents > 0 ? ` Another ${money(balance.unlinkedAssignedCents, balance.currency)} is assigned to costs without a linked funding source.` : ""}
          </p>
          {balance.unlinkedReceivedCents > 0 ? <p className="text-sm text-muted-foreground">{money(balance.unlinkedReceivedCents, balance.currency)} received is not linked to these promises. It is counted once in Received and Available now.</p> : null}
        </div>;
      })}
      {pendingCount || unlinked || funding.excludedPayments.length ? <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t pt-2 text-sm">
        {pendingCount ? <Link href={`${budgetHref}#agreements-fees`} className="inline-flex min-h-11 items-center gap-1 font-medium text-primary">Review {pendingCount} payment amount{pendingCount === 1 ? "" : "s"}<ArrowRight className="size-4" /></Link> : null}
        {unlinked ? <Link href={`${budgetHref}#cash-reconciliation`} className="inline-flex min-h-11 items-center gap-1 font-medium text-primary">Review received funding<ArrowRight className="size-4" /></Link> : null}
        {funding.excludedPayments.length ? <Link href={`${budgetHref}#agreements-fees`} className="inline-flex min-h-11 items-center gap-1 font-medium text-primary">Review fee direction<ArrowRight className="size-4" /></Link> : null}
      </div> : null}
      {view !== "summary" && funding.sources.length ? <div className="space-y-2">
        <h3 className="text-sm font-semibold">{view === "agreement" ? "Funding terms and installments" : "Funding commitments"}</h3>
        <ul className="divide-y border-y">{funding.sources.map(source => <li key={`${source.type}-${source.id}`} className="grid gap-3 py-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <Link href={source.type === "agreement" ? `/agreements/${source.id}` : source.type === "donation" ? `${budgetHref}#partner-proposals` : `${budgetHref}#mou-payment-${source.id}`} className="inline-flex min-h-11 items-center break-words text-sm font-medium text-primary underline underline-offset-4">{source.name}</Link>
            <p className="text-xs text-muted-foreground">{source.type === "agreement" ? "Shared agreement allocation" : source.type === "donation" ? "Promised donation" : "Expected partner payment"}{source.dueDate ? ` · due ${formatDate(source.dueDate)}` : ""}</p>
            {source.notes ? <p className="mt-1 max-w-prose break-words text-sm text-muted-foreground">{source.notes}</p> : null}
            {source.calculation ? <p className="mt-1 text-sm">{source.calculation.percentage}% of {money(source.calculation.totalCents, source.currency)} = {money(source.calculation.amountCents, source.currency)}. Confirm this amount before invoicing.</p> : source.amountPending ? <p className="mt-1 text-sm text-warning-text">Set the amount before invoicing.</p> : source.reviewRequired ? <p className="mt-1 text-sm text-warning-text">Agreement allocation needs review.</p> : null}
            {source.receiptMissing ? <p className="mt-1 text-sm text-warning-text">Marked received without a matching receipt. Review this payment.</p> : null}
          </div>
          <dl className="grid grid-cols-2 gap-x-5 text-sm lg:min-w-56">
            <div><dt className="text-xs text-muted-foreground">{source.amountPending ? "Suggested" : "Promised"}</dt><dd className="mt-1 tabular-nums">{source.amountPending && !source.calculation ? "Amount needed" : money(source.promisedCents, source.currency)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Linked receipts</dt><dd className="mt-1 tabular-nums">{money(source.receivedCents, source.currency)}</dd></div>
          </dl>
        </li>)}</ul>
      </div> : null}
      {funding.excludedPayments.length ? <div className="space-y-1 border-t pt-3 text-sm">
        <p className="font-medium">Fee direction needs review</p>
        {funding.excludedPayments.map(payment => <p key={payment.id} className="max-w-prose text-muted-foreground">{money(Math.round(Number(payment.amount) * 100), payment.currency)} is described as payable to the licensor. It is excluded from promised income here. Review it as an outgoing cost.</p>)}
      </div> : null}
      {view === "full" && funding.receipts.length ? <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Recent money received</h3><Link href={`${budgetHref}#cash-reconciliation`} className="inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4">View all receipts ({funding.receipts.length})</Link></div>
        <ul className="divide-y border-y">{funding.receipts.slice(0, 5).map(receipt => <li key={receipt.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><div className="min-w-0"><p className="break-words font-medium">{receipt.source || (receipt.donation ? "Donation" : "Funding received")}</p><p className="text-xs text-muted-foreground">{receipt.donation ? "Donation" : "Payment"}{receipt.receivedDate ? ` · ${formatDate(receipt.receivedDate)}` : ""}</p></div><div className="text-right tabular-nums"><p>{money(Math.round(Number(receipt.amount) * 100), receipt.currency)} received</p><p className="text-xs text-muted-foreground">{money(receipt.netCents, receipt.currency)} after deductions</p></div></li>)}</ul>
      </div> : null}
    </>}
    <p className="text-xs text-muted-foreground">Promised funding is not available cash. Reprint budgets and sponsorship funds stay separate.</p>
  </section>;
}
