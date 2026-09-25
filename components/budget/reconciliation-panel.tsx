"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Scale } from "lucide-react";
import { toast } from "sonner";

import { updateBudgetLine } from "@/lib/budget/actions";
import { centsToAmount, type ReconRow } from "@/lib/budget/reconcile-math";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { usePropState } from "@/hooks/use-prop-state";

function money(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(centsToAmount(cents));
  } catch {
    return `${currency} ${centsToAmount(cents).toFixed(2)}`;
  }
}

/**
 * Manager-only: quotation lines whose manual "Spent" disagrees with recorded
 * paid payments, each with a one-click "Adopt recorded". Renders nothing when
 * everything reconciles (silence = good news).
 */
export function ReconciliationPanel({
  mismatches,
  offQuotation,
  currency,
}: {
  mismatches: ReconRow[];
  offQuotation: { royalties: number; licenseFees: number; print: number };
  currency: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [visibleMismatches, setVisibleMismatches] = usePropState(mismatches);

  const offTotal =
    offQuotation.royalties + offQuotation.licenseFees + offQuotation.print;
  if (visibleMismatches.length === 0 && offTotal === 0) return null;

  return (
    <Card className={visibleMismatches.length ? "border-amber-300 dark:border-amber-900/60" : undefined}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Scale className="size-4 text-muted-foreground" />
          Spend reconciliation
        </CardTitle>
        <CardDescription>
          Recorded paid payments vs the quotation&apos;s manual &quot;Spent&quot;
          values.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {visibleMismatches.map((row) => (
          <div
            key={row.budgetItemId}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-amber-50/60 px-3 py-2 text-sm dark:bg-amber-950/20"
          >
            <div className="min-w-0">
              <p className="font-medium">{row.label}</p>
              <p className="text-xs text-muted-foreground">
                {row.paymentCount} paid payment{row.paymentCount === 1 ? "" : "s"}{" "}
                total {money(row.spentRecordedCents, row.currency)}, but the line
                shows {money(row.spentManualCents, row.currency)} spent (
                {row.varianceCents > 0 ? "+" : ""}
                {money(row.varianceCents, row.currency)}).
              </p>
            </div>
            <Button
              variant="outline"
              size="xs"
              disabled={pending}
              onClick={() => {
                const previous = visibleMismatches;
                setVisibleMismatches((current) =>
                  current.filter((item) => item.budgetItemId !== row.budgetItemId)
                );
                start(async () => {
                  try {
                    await updateBudgetLine(row.budgetItemId, {
                      amountSpent: centsToAmount(row.spentRecordedCents),
                    });
                    toast.success(
                      `"${row.label}" spent set to ${money(row.spentRecordedCents, row.currency)}`
                    );
                    router.refresh();
                  } catch (error) {
                    setVisibleMismatches(previous);
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : "Could not adopt the recorded spend."
                    );
                  }
                })
              }}
            >
              Adopt recorded
            </Button>
          </div>
        ))}

        {offTotal > 0 ? (
          <p className="text-xs text-muted-foreground">
            Paid outside the quotation lines:{" "}
            {[
              offQuotation.royalties > 0
                ? `royalties ${money(offQuotation.royalties, currency)}`
                : null,
              offQuotation.licenseFees > 0
                ? `license fees ${money(offQuotation.licenseFees, currency)}`
                : null,
              offQuotation.print > 0
                ? `print payments ${money(offQuotation.print, currency)} (no print/ship line in the quotation)`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            . These don&apos;t appear in estimate-vs-actual.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
