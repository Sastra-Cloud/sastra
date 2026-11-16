"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { percentageAmountCents, type PaymentPercentageCalculation } from "@/lib/budget/payment-percentage";

/** Keep the amount and its source calculation together during invoice review. */
export function PaymentAmountField({ value, currency, calculation, quotationTotal, disabled, onChange }: {
  value: string;
  currency: string;
  calculation?: PaymentPercentageCalculation;
  quotationTotal: number;
  disabled: boolean;
  onChange: (amount: string) => void;
}) {
  const id = useId();
  const [percentage, setPercentage] = useState(calculation ? String(calculation.percentage) : "50");
  const [total, setTotal] = useState(calculation ? (calculation.totalCents / 100).toFixed(2) : quotationTotal > 0 ? quotationTotal.toFixed(2) : "");
  const amountCents = percentageAmountCents(Number(total), Number(percentage));
  const money = (cents: number) => new Intl.NumberFormat(undefined, { style: "currency", currency, currencyDisplay: "code" }).format(cents / 100);
  function recalculate(nextTotal: string, nextPercentage: string) {
    const cents = percentageAmountCents(Number(nextTotal), Number(nextPercentage));
    onChange(cents != null ? (cents / 100).toFixed(2) : "");
  }
  return <div className="grid min-w-0 gap-2 sm:col-span-2">
    <div className="grid gap-1">
      <Label htmlFor={`${id}-amount`}>Expected amount ({currency})</Label>
      <Input id={`${id}-amount`} type="number" min="0" step="0.01" value={value}
        disabled={disabled} onChange={(event) => onChange(event.target.value)} autoFocus />
    </div>
    <details open={calculation != null} className="min-w-0 text-sm">
      <summary className="cursor-pointer text-muted-foreground">Calculate a percentage</summary>
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2">
        <div className="grid gap-1">
          <Label htmlFor={`${id}-percentage`}>Percentage</Label>
          <Input id={`${id}-percentage`} type="number" min="0.01" max="100" step="0.01" value={percentage} disabled={disabled}
            onChange={(event) => { setPercentage(event.target.value); recalculate(total, event.target.value); }} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`${id}-total`}>Total ({currency})</Label>
          <Input id={`${id}-total`} type="number" min="0.01" step="0.01" value={total} disabled={disabled}
            onChange={(event) => { setTotal(event.target.value); recalculate(event.target.value, percentage); }} />
        </div>
        <p className="col-span-2 text-xs text-muted-foreground">
          {calculation?.source === "payment_terms" ? "Total from the saved payment terms. Check it against the agreement." : "Total from the current quotation. Change it if the agreement uses another total."}
        </p>
        <div className="col-span-2 flex flex-wrap items-center gap-2" aria-live="polite">
          {amountCents == null ? <span className="text-destructive">Enter a positive total and a percentage up to 100.</span> : <>
            <span className="tabular-nums">{percentage}% of {money(Math.round(Number(total) * 100))} = <strong>{money(amountCents)}</strong></span>
            {Math.round(Number(value) * 100) !== amountCents ? <Button type="button" size="xs" variant="outline" disabled={disabled} onClick={() => onChange((amountCents / 100).toFixed(2))}>Use calculated amount</Button> : null}
          </>}
        </div>
      </div>
    </details>
  </div>;
}
