"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { expectedNetCents } from "@/lib/budget/compute";
import { addPartnerPrintOptions, type PartnerPrintCandidate, type PartnerPrintOption } from "@/lib/budget/print-options";

export function PartnerPrintOptions({ options, candidates, currency, baseCents, internalBaseCents, deductionBps, disabled, canEdit, onChange }: {
  options: PartnerPrintOption[];
  candidates: PartnerPrintCandidate[];
  currency: string;
  baseCents: number;
  internalBaseCents: number;
  deductionBps: number;
  disabled: boolean;
  canEdit: boolean;
  onChange: (options: PartnerPrintOption[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const money = (cents: number, code = currency) => new Intl.NumberFormat(undefined, { style: "currency", currency: code }).format(cents / 100);
  const available = candidates.filter((candidate) => !options.some((option) => option.sourceQuoteId === candidate.sourceQuoteId));
  const eligible = available.filter((candidate) => candidate.currency === currency);
  const reviewing = adding || options.length === 0;
  const feePercent = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(deductionBps / 100);
  function addCandidates(choices: PartnerPrintCandidate[]) {
    onChange(addPartnerPrintOptions(options, choices, currency, baseCents, internalBaseCents, deductionBps));
    setAdding(false);
  }
  return <section id="partner-print-options" className="scroll-mt-32 space-y-3 border-t pt-5" aria-labelledby="partner-print-options-heading">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="max-w-2xl">
        <h4 id="partner-print-options-heading" className="font-semibold">Printing options by quantity</h4>
        <p className="mt-1 text-sm text-muted-foreground">Include all quantities you want the partner to compare. Each project price covers that print quantity plus shared costs. The partner chooses one; these prices are never added together.</p>
        {options.length ? <p className="mt-1 text-xs text-muted-foreground">Replaces the Printing / Shipping line. Include delivery costs in each option.</p> : null}
      </div>
      {canEdit && options.length > 0 && (available.length > 0 || adding) ? <Button size="sm" variant="outline" disabled={disabled} onClick={() => setAdding(!adding)} aria-expanded={reviewing}>
        {reviewing ? <X className="size-4" /> : <Plus className="size-4" />}{reviewing ? "Close printer quotes" : "Add more quantities"}
      </Button> : null}
    </div>
    {canEdit && reviewing && available.length > 0 ? <div className="rounded-lg border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium">Review the printer quantities to include</p>
        {eligible.length > 1 ? <Button size="sm" disabled={disabled || options.length + eligible.length > 30} onClick={() => addCandidates(eligible)}><Plus className="size-4" />Add all {eligible.length} quantities</Button> : null}
      </div>
      <p className="mt-2 max-w-3xl text-xs text-muted-foreground">Review costs and specifications, then add one or all quantities. Project prices cover the {feePercent}% organization donation fee. The working estimate stays unchanged; no printer quote is accepted.</p>
      <ul className="mt-3 divide-y">
        {available.map((candidate) => <li key={candidate.sourceQuoteId} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium">{candidate.quantity.toLocaleString()} copies · {money(candidate.printingCostCents, candidate.currency)} <span className="font-normal text-muted-foreground">{candidate.printer}</span></p>
            <p className="max-w-3xl text-xs text-muted-foreground [overflow-wrap:anywhere]">{candidate.specifications || "Check specifications with the printer."}</p>
            {candidate.sourceThreadId ? <a className="text-xs underline underline-offset-4" href={`/correspondence/${candidate.sourceThreadId}`} target="_blank" rel="noreferrer">View printer email</a> : null}
            {candidate.currency !== currency ? <p className="text-xs text-destructive">Quoted in {candidate.currency}. A {currency} quote is required; currency is not converted.</p> : null}
          </div>
          <Button size="sm" variant="outline" disabled={disabled || options.length >= 30 || candidate.currency !== currency} onClick={() => addCandidates([candidate])}><Plus className="size-4" />Add {candidate.quantity.toLocaleString()}-copy option</Button>
        </li>)}
        {!available.length ? <li className="py-3 text-sm text-muted-foreground">All printer quotes have been added.</li> : null}
      </ul>
    </div> : null}
    {options.length ? <p className="text-sm font-medium">{options.length === 1 ? "1 quantity included in the partner quote" : `${options.length} quantities included in the partner quote`}</p> : null}
    {options.length ? <p className="text-xs text-muted-foreground">Printer costs, the organization fee, and available-funding checks are internal only.{canEdit ? <> After you change the fee or shared costs, <a href="#partner-fee-coverage" className="font-medium underline underline-offset-4">apply fee coverage</a> to update every printing price.</> : null}</p> : null}
    {options.length ? <div className="divide-y rounded-lg border">
      <div className="hidden gap-4 rounded-t-lg bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground @min-[58rem]/print-options:grid @min-[58rem]/print-options:grid-cols-[minmax(10rem,1fr)_minmax(12rem,1fr)_9rem_11rem_2rem]">
        <span>Print quantity</span><span>Partner description</span><span>Printing price ({currency})</span><span className="text-right">Project price</span><span />
      </div>
      {[...options].sort((a, b) => a.quantity - b.quantity).map((option) => {
        const projectCents = baseCents + option.partnerAmountCents;
        const availableCents = expectedNetCents(projectCents, deductionBps);
        const feeCents = projectCents - availableCents;
        const shortfall = internalBaseCents + option.printingCostCents - availableCents;
        const patch = (changes: Partial<PartnerPrintOption>) => onChange(options.map((row) => row.sourceQuoteId === option.sourceQuoteId ? { ...row, ...changes } : row));
        return <div key={option.sourceQuoteId} className="relative grid gap-4 p-4 @min-[35rem]/print-options:grid-cols-2 @min-[58rem]/print-options:grid-cols-[minmax(10rem,1fr)_minmax(12rem,1fr)_9rem_11rem_2rem] @min-[58rem]/print-options:items-start">
          <div className="pr-9 @min-[35rem]/print-options:pr-0">
            <p className="font-semibold tabular-nums">{option.quantity.toLocaleString()} copies</p>
            <p className="mt-1 text-xs text-muted-foreground">Printer cost: {money(option.printingCostCents)}</p>
          </div>
          <label className="grid gap-1.5 text-xs text-muted-foreground"><span className="@min-[58rem]/print-options:sr-only">Partner description</span>
            <Input value={option.label} aria-label={`Printing description for ${option.quantity} copies`} disabled={!canEdit || disabled} maxLength={200} onChange={(event) => patch({ label: event.target.value })} />
          </label>
          <label className="grid gap-1.5 text-xs text-muted-foreground"><span className="@min-[58rem]/print-options:sr-only">Printing price ({currency})</span>
            <Input type="number" min="0" step="0.01" value={option.partnerAmountCents / 100} aria-label={`Partner printing price for ${option.quantity} copies`} disabled={!canEdit || disabled} onChange={(event) => patch({ partnerAmountCents: Math.round(Number(event.target.value) * 100) })} />
            <span>{money(option.partnerAmountCents / option.quantity)} / copy for printing</span>
          </label>
          <div className="@min-[58rem]/print-options:text-right">
            <p className="text-xs text-muted-foreground @min-[58rem]/print-options:sr-only">Project price</p>
            <p className="text-lg font-semibold tabular-nums">{money(projectCents)}</p>
            <p className="text-xs text-muted-foreground">Shared costs + this print quantity</p>
            <p className="mt-1 text-xs text-muted-foreground">Organization fee ({feePercent}%): {money(feeCents)}</p>
            <p className="text-xs text-muted-foreground">Available after fee: {money(availableCents)}</p>
            {shortfall > 0 ? <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">Short by {money(shortfall)} after fee</p> : <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-200">Covers costs after fee</p>}
          </div>
          {canEdit ? <Button size="icon-sm" variant="ghost" className="absolute right-2 top-2 @min-[35rem]/print-options:static" disabled={disabled} aria-label={`Remove ${option.quantity} copy option`} onClick={() => onChange(options.filter((row) => row.sourceQuoteId !== option.sourceQuoteId))}><X className="size-4" /></Button> : null}
        </div>;
      })}
    </div> : !available.length ? <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Request a printer estimate above, then add its quantity options here.</p> : null}
  </section>;
}
