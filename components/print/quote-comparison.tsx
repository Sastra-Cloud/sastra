import { Calculator, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { HelpTip } from "@/components/ui/help-tip";
import {
  buildPrintQuoteComparisonGroups,
  type PrintQuoteEconomicsInput,
  type PrintQuoteStepUp,
} from "@/lib/print/quote-economics";
import { cn } from "@/lib/utils";

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function percent(value: number) {
  return `${Math.round(value)}%`;
}

function StepUpInsight({
  step,
  currency,
}: {
  step: PrintQuoteStepUp;
  currency: string;
}) {
  return (
    <div className="rounded-lg border border-success/30 bg-success/10 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-success" />
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {step.to.quantity.toLocaleString()} copies is the recommended
            balance.
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            It costs {money(step.extraSpend, currency)} more than{" "}
            {step.from.quantity.toLocaleString()} and adds{" "}
            {step.extraCopies.toLocaleString()} copies at an effective{" "}
            <span className="font-medium text-foreground">
              {money(step.incrementalUnitCost, currency)} per additional copy
            </span>
            {step.incrementalSavingsPercent !== null
              ? ` — ${percent(step.incrementalSavingsPercent)} below the ${money(step.from.unitCost, currency)} unit cost at ${step.from.quantity.toLocaleString()}.`
              : "."}
          </p>
          {step.valueThresholdQuantity !== null &&
          step.valueThresholdPercent !== null ? (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              The larger run wins on used-copy cost if you expect to use at
              least{" "}
              <span className="font-medium text-foreground">
                {step.valueThresholdQuantity.toLocaleString()} copies
              </span>{" "}
              ({percent(step.valueThresholdPercent)} of the run), before
              storage or disposal costs.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function QuoteComparison({
  quotes,
}: {
  quotes: PrintQuoteEconomicsInput[];
}) {
  const comparisons = buildPrintQuoteComparisonGroups(quotes);
  if (comparisons.length === 0) return null;

  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="flex items-center gap-1.5 text-sm font-semibold">
            <Calculator className="size-4" />
            Compare print quantities
          </h4>
          <p className="mt-0.5 text-xs text-muted-foreground">
            See total cash required, unit value, and the cost of moving up a
            tier.
          </p>
        </div>
        <HelpTip title="How this comparison works" side="left">
          Total cost uses the quoted total, or quantity × unit price when a
          total is missing. Additional-copy cost is the difference in totals
          divided by the difference in quantities. Recommended balance marks
          the tier reached by the lowest useful additional-copy cost. Lowest
          cost per copy is shown separately. Currencies are never mixed.
        </HelpTip>
      </div>

      {comparisons.map((comparison) => (
        <div key={comparison.currency} className="space-y-2.5">
          {comparison.bestStep ? (
            <StepUpInsight
              step={comparison.bestStep}
              currency={comparison.currency}
            />
          ) : null}

          <div
            role="table"
            aria-label={`Print quantity comparison in ${comparison.currency}`}
            className="space-y-1.5"
          >
            {comparison.tiers.map((tier) => {
              const step = comparison.steps.find(
                (candidate) => candidate.to.quoteId === tier.quoteId,
              );
              const barWidth =
                (tier.totalCost / comparison.maximumTotalCost) * 100;

              return (
                <div
                  key={tier.quoteId}
                  role="row"
                  className="grid gap-2 rounded-md bg-background/70 px-2.5 py-2 sm:grid-cols-[8.5rem_minmax(0,1fr)_8.5rem] sm:items-center"
                >
                  <div role="cell" className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium tabular-nums">
                      {tier.quantity.toLocaleString()} copies
                    </span>
                    {tier.quoteId === comparison.lowestOutlayQuoteId ? (
                      <Badge variant="outline" className="text-[10px]">
                        Lowest outlay
                      </Badge>
                    ) : null}
                    {tier.quoteId === comparison.recommendedQuoteId ? (
                      <Badge className="bg-success text-success-foreground text-[10px]">
                        Recommended balance
                      </Badge>
                    ) : null}
                    {tier.quoteId === comparison.bestUnitQuoteId ? (
                      <Badge variant="outline" className="text-[10px]">
                        Lowest cost/copy
                      </Badge>
                    ) : null}
                  </div>

                  <div role="cell" className="min-w-0">
                    <div
                      className="h-2 overflow-hidden rounded-full bg-muted"
                      aria-hidden="true"
                    >
                      <div
                        className={cn(
                          "h-full rounded-full",
                          tier.quoteId === comparison.recommendedQuoteId
                            ? "bg-success"
                            : "bg-primary/60",
                        )}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                    {step ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        +{step.extraCopies.toLocaleString()} copies for +
                        {money(step.extraSpend, comparison.currency)} ·{" "}
                        {money(step.incrementalUnitCost, comparison.currency)}
                        /additional copy
                      </p>
                    ) : (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Starting tier
                      </p>
                    )}
                  </div>

                  <div role="cell" className="sm:text-right">
                    <p className="font-heading text-base font-semibold tabular-nums">
                      {money(tier.totalCost, comparison.currency)}
                    </p>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {money(tier.unitCost, comparison.currency)} per copy
                      {tier.totalWasCalculated ? " · calculated total" : ""}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        “Recommended balance” identifies the best-priced step-up, not a demand
        forecast. “Lowest cost/copy” measures print price only. Confirm expected
        demand, available cash, storage, shipping, and the risk of unused copies
        before choosing a run.
      </p>
    </div>
  );
}
