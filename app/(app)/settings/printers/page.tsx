import { Printer } from "lucide-react";

import { requireRole } from "@/lib/auth/guards";
import { getPrinterHistory, type PrinterHistory } from "@/lib/print/history-queries";
import { Card, CardContent } from "@/components/ui/card";
import { timeAgo } from "@/lib/format";

export const metadata = { title: "Printers" };
export const dynamic = "force-dynamic";

function money(n: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  }).format(n);
}

function days(n: number | null): string {
  if (n == null) return "—";
  return `${n.toFixed(n < 10 ? 1 : 0)}d`;
}

export default async function PrintersSettingsPage() {
  await requireRole("manager");
  const printers = await getPrinterHistory();
  const withHistory = printers.filter((p) => p.quotesCount > 0);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading text-xl font-semibold">Printer performance</h2>
        <p className="text-sm text-muted-foreground">
          Price-per-copy, page-estimate accuracy, and turnaround across past runs.
          Delivery time isn&apos;t tracked, so it&apos;s not shown.
        </p>
      </div>

      {withHistory.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No printer quote history yet. It builds up as quotes are received and
            accepted.
          </CardContent>
        </Card>
      ) : (
        withHistory.map((p) => <PrinterCard key={p.contactId} p={p} />)
      )}
    </div>
  );
}

function PrinterCard({ p }: { p: PrinterHistory }) {
  return (
    <Card>
      <CardContent className="space-y-4 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Printer className="size-4" />
            </span>
            <div>
              <p className="font-medium">{p.name}</p>
              {p.company ? (
                <p className="text-xs text-muted-foreground">{p.company}</p>
              ) : null}
            </div>
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            {p.runsCount} run{p.runsCount === 1 ? "" : "s"} · {p.quotesCount} quote
            {p.quotesCount === 1 ? "" : "s"} · {p.acceptedCount} accepted
            {p.lastQuoteAt ? ` · last ${timeAgo(p.lastQuoteAt)}` : ""}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Stat
            label="Page estimate accuracy"
            value={
              p.pageAccuracyPct == null
                ? "—"
                : `±${p.pageAccuracyPct.toFixed(0)}%`
            }
            hint={
              p.pageAccuracySample
                ? `over ${p.pageAccuracySample} run${p.pageAccuracySample === 1 ? "" : "s"}`
                : "no quoted pages yet"
            }
          />
          <Stat
            label="Quote → accept"
            value={days(p.avgQuoteToAcceptDays)}
            hint="avg turnaround"
          />
          <Stat
            label="Wire → paid"
            value={days(p.avgWireToPayDays)}
            hint="avg settle time"
          />
        </div>

        {p.bands.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">
              Accepted price per copy, by quantity
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="py-1 text-left font-medium">Quantity</th>
                    <th className="py-1 text-right font-medium">Avg</th>
                    <th className="py-1 text-right font-medium">Range</th>
                    <th className="py-1 text-right font-medium">Quotes</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {p.bands.map((b) => (
                    <tr key={b.band}>
                      <td className="py-1.5">{b.band}</td>
                      <td className="py-1.5 text-right tabular-nums">
                        {money(b.avgUnitPrice)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                        {b.minUnitPrice === b.maxUnitPrice
                          ? "—"
                          : `${money(b.minUnitPrice)}–${money(b.maxUnitPrice)}`}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                        {b.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            No accepted quotes yet — price history appears once quotes are accepted.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
