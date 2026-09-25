import { Banknote } from "lucide-react";

import { centsToAmount, type CashflowMonth } from "@/lib/budget/reconcile-math";
import { TrendLine } from "@/components/portfolio/charts/trend-line";

function money(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(centsToAmount(cents));
  } catch {
    return `${currency} ${centsToAmount(cents).toFixed(0)}`;
  }
}

/** Monthly money in (receipts) vs money out (paid payments) with running net. */
export function CashflowCard({
  cashflow,
  totals,
  currency,
}: {
  cashflow: CashflowMonth[];
  totals: { inCents: number; outCents: number };
  currency: string;
}) {
  if (cashflow.length === 0) return null;
  const netCents = totals.inCents - totals.outCents;
  const label = (m: string) => m.slice(2); // "26-07"

  return (
    <section className="space-y-4" aria-labelledby="cash-flow-heading">
      <div>
        <h2
          id="cash-flow-heading"
          className="flex items-center gap-2 text-sm font-semibold"
        >
          <Banknote className="size-4 text-muted-foreground" />
          Cash flow
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Confirmed receipts and recorded payments over time.
        </p>
      </div>

      <dl className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3">
        <div className="bg-background px-4 py-3">
          <dt className="text-xs text-muted-foreground">Received</dt>
          <dd className="mt-0.5 font-semibold tabular-nums">
            {money(totals.inCents, currency)}
          </dd>
        </div>
        <div className="bg-background px-4 py-3">
          <dt className="text-xs text-muted-foreground">Paid out</dt>
          <dd className="mt-0.5 font-semibold tabular-nums">
            {money(totals.outCents, currency)}
          </dd>
        </div>
        <div className="bg-background px-4 py-3">
          <dt className="text-xs text-muted-foreground">Net cash</dt>
          <dd
            className={
              netCents < 0
                ? "mt-0.5 font-semibold tabular-nums text-destructive"
                : "mt-0.5 font-semibold tabular-nums text-success"
            }
          >
            {money(netCents, currency)}
          </dd>
        </div>
      </dl>

      {cashflow.length < 2 ? (
        <p className="rounded-lg bg-muted/35 px-4 py-3 text-sm text-muted-foreground">
          Monthly trends will appear after another month of activity.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 rounded-lg bg-muted/25 p-3">
            <p className="text-xs font-medium text-muted-foreground">
              Money in / month
            </p>
            <TrendLine
              data={cashflow.map((month) => ({
                label: label(month.month),
                value: centsToAmount(month.inCents),
              }))}
              color="var(--success)"
              unit="in"
            />
          </div>
          <div className="space-y-1 rounded-lg bg-muted/25 p-3">
            <p className="text-xs font-medium text-muted-foreground">
              Money out / month
            </p>
            <TrendLine
              data={cashflow.map((month) => ({
                label: label(month.month),
                value: centsToAmount(month.outCents),
              }))}
              color="var(--destructive)"
              unit="out"
            />
          </div>
        </div>
      )}
    </section>
  );
}
