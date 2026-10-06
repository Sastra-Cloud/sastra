"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { recordSponsorshipFundUse, recordSponsorshipReceipt, reverseSponsorshipFundUse, reverseSponsorshipReceipt } from "@/lib/sponsorships/actions";
import { allocateSponsorshipCents, decimalAmount, fundUseInputSchema, moneyCents, receiptInputSchema, sponsorshipProjectShares } from "@/lib/sponsorships/compute";
import type { SponsorshipDetail } from "@/lib/sponsorships/queries";
import { sponsorshipMoney } from "@/lib/sponsorships/format";
import { formatDate } from "@/lib/format";

export function SponsorshipFunding({ detail, today }: { detail: SponsorshipDetail; today: string }) {
  const router = useRouter();
  const { record, receipts, allocations, uses, activeInvoice } = detail;
  const currency = activeInvoice?.currency ?? record.currency;
  const activeReceipts = new Set(receipts.filter(receipt => !receipt.reversedAt).map(receipt => receipt.id));
  const shares = sponsorshipProjectShares(activeInvoice?.lineItems ?? detail.lines);
  const books = shares.map(share => {
    const line = detail.lines.find(line => line.projectId === share.projectId)!;
    const bookAllocations = allocations.filter(row => row.projectId === share.projectId && activeReceipts.has(row.receiptId));
    const received = bookAllocations.reduce((sum, row) => sum + moneyCents(row.actualNetAmount), 0);
    const gross = bookAllocations.reduce((sum, row) => sum + moneyCents(row.amount), 0);
    const used = uses.filter(row => row.projectId === share.projectId && !row.reversedAt).reduce((sum, row) => sum + moneyCents(row.amount), 0);
    return { ...share, title: line.projectTitle, slug: line.projectSlug, gross, received, used, available: received - used };
  });
  const grossReceived = receipts.filter(receipt => !receipt.reversedAt).reduce((sum, receipt) => sum + moneyCents(receipt.amount), 0);
  const remaining = shares.reduce((sum, share) => sum + share.cents, 0) - grossReceived;
  const [receiving, setReceiving] = useState(false);
  const [useBook, setUseBook] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState({ id: "", amount: "", actualNetAmount: "", receivedDate: today, note: "" });
  const [use, setUse] = useState({ id: "", amount: "", usedDate: today, note: "" });
  const [correction, setCorrection] = useState<{ kind: "receipt" | "use"; id: string } | null>(null);
  const [reason, setReason] = useState("");
  function run(work: () => Promise<{ error?: string }>, message: string, onSuccess: () => void) {
    setError(null);
    start(async () => {
      try {
        const result = await work();
        if (result.error) { setError(result.error); return; }
        toast.success(message); onSuccess(); router.refresh();
      } catch { setError("Couldn't save. Your entries are kept. Refresh the history before trying again."); }
    });
  }
  let preview: Array<{ projectId: string; cents: number }> = [];
  try { preview = allocateSponsorshipCents(moneyCents(receipt.amount), books.map(book => ({ projectId: book.projectId, cents: book.cents - book.gross }))); } catch { /* incomplete amount */ }

  return <section className="space-y-5 rounded-xl border bg-card p-4 md:p-5" id="sponsorship-funds">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1"><h2 className="text-base font-semibold">Sponsorship funds</h2><p className="max-w-2xl text-sm text-muted-foreground">These funds have their own balance. Record amounts used as you use them.</p></div>
      {activeInvoice && remaining > 0 && ["issued", "sent"].includes(activeInvoice.status) && <Button variant="outline" disabled={pending || receiving} onClick={() => {
        setReceiving(true); setUseBook(null); setCorrection(null); setError(null);
        setReceipt({ id: crypto.randomUUID(), amount: decimalAmount(remaining), actualNetAmount: decimalAmount(Math.round(remaining * (10_000 - record.deductionBps) / 10_000)), receivedDate: today, note: "" });
      }}>Record funding received</Button>}
    </div>
    <div className="divide-y border-y">
      {books.map(book => <div key={book.projectId} className="space-y-3 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={`/projects/${book.slug}`} className="font-medium text-primary underline underline-offset-4">{book.title}</Link>
          {book.available > 0 && <Button variant="outline" size="sm" disabled={pending || useBook === book.projectId} onClick={() => {
            setUseBook(book.projectId); setReceiving(false); setCorrection(null); setError(null);
            setUse({ id: crypto.randomUUID(), amount: "", usedDate: today, note: "" });
          }}>Record funds used</Button>}
        </div>
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <div><dt className="text-muted-foreground">Funds received</dt><dd className="mt-1 tabular-nums">{sponsorshipMoney(decimalAmount(book.received), currency)}</dd></div>
          <div><dt className="text-muted-foreground">Used</dt><dd className="mt-1 tabular-nums">{sponsorshipMoney(decimalAmount(book.used), currency)}</dd></div>
          <div><dt className="text-muted-foreground">Available</dt><dd className="mt-1 font-semibold tabular-nums">{sponsorshipMoney(decimalAmount(book.available), currency)}</dd></div>
        </dl>
        {useBook === book.projectId && <form className="space-y-3 rounded-lg bg-muted/30 p-3" onSubmit={event => {
          event.preventDefault();
          const parsed = fundUseInputSchema.safeParse({ ...use, projectId: book.projectId });
          if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the amount used."); return; }
          run(() => recordSponsorshipFundUse(record.id, parsed.data), "Funds used recorded.", () => setUseBook(null));
        }}>
          <p className="text-sm font-medium">Review funds used for {book.title}</p>
          <fieldset disabled={pending} className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5"><Label htmlFor="fund-use-amount">Amount used ({currency})</Label><Input className="min-h-11" id="fund-use-amount" required inputMode="decimal" value={use.amount} onChange={event => setUse(current => ({ ...current, amount: event.target.value }))} /></div>
            <div className="grid gap-1.5"><Label htmlFor="fund-use-date">Date used</Label><Input className="min-h-11" id="fund-use-date" required type="date" value={use.usedDate} onChange={event => setUse(current => ({ ...current, usedDate: event.target.value }))} /></div>
            <div className="grid gap-1.5 sm:col-span-2"><Label htmlFor="fund-use-note">What were the funds used for?</Label><Textarea id="fund-use-note" required maxLength={1000} value={use.note} onChange={event => setUse(current => ({ ...current, note: event.target.value }))} /></div>
          </fieldset>
          <p className="text-xs text-muted-foreground">This records the use of sponsorship funds. It does not create a budget expense or send money.</p>
          <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" disabled={pending} onClick={() => setUseBook(null)}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? "Recording funds used…" : "Confirm funds used"}</Button></div>
        </form>}
      </div>)}
    </div>
    {!activeReceipts.size && <p className="text-sm text-muted-foreground">Funds become available after a payment is recorded. Sponsored copies are kept separate from distributed copies.</p>}
    {receiving && activeInvoice && <form className="space-y-4 rounded-lg bg-muted/30 p-3" onSubmit={event => {
      event.preventDefault();
      const parsed = receiptInputSchema.safeParse({ ...receipt, invoiceId: activeInvoice.id });
      if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the received funding."); return; }
      run(() => recordSponsorshipReceipt(record.id, parsed.data), "Funding received recorded.", () => setReceiving(false));
    }}>
      <h3 className="text-sm font-semibold">Review funding received</h3>
      <fieldset disabled={pending} className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5"><Label htmlFor="funding-gross">Gross received ({currency})</Label><Input className="min-h-11" id="funding-gross" required inputMode="decimal" value={receipt.amount} onChange={event => {
          const amount = event.target.value;
          let net = receipt.actualNetAmount;
          try { net = decimalAmount(Math.round(moneyCents(amount) * (10_000 - record.deductionBps) / 10_000)); } catch { /* preserve net */ }
          setReceipt(current => ({ ...current, amount, actualNetAmount: net }));
        }} /></div>
        <div className="grid gap-1.5"><Label htmlFor="funding-net">Actual available after fees ({currency})</Label><Input className="min-h-11" id="funding-net" required inputMode="decimal" value={receipt.actualNetAmount} onChange={event => setReceipt(current => ({ ...current, actualNetAmount: event.target.value }))} /></div>
        <div className="grid gap-1.5"><Label htmlFor="funding-date">Date received</Label><Input className="min-h-11" id="funding-date" required type="date" value={receipt.receivedDate} onChange={event => setReceipt(current => ({ ...current, receivedDate: event.target.value }))} /></div>
        <div className="grid gap-1.5"><Label htmlFor="funding-note">Payment note (optional)</Label><Input className="min-h-11" id="funding-note" maxLength={1000} value={receipt.note} onChange={event => setReceipt(current => ({ ...current, note: event.target.value }))} /></div>
      </fieldset>
      <p className="text-xs text-muted-foreground">The donation fee saved with this sponsorship is {(record.deductionBps / 100).toFixed(2)}%. Review the amount actually available.</p>
      {preview.length > 0 && <ul className="space-y-1 text-sm">{preview.filter(row => row.cents).map(row => <li key={row.projectId} className="flex flex-wrap justify-between gap-2"><span>{books.find(book => book.projectId === row.projectId)?.title}</span><span className="tabular-nums">{sponsorshipMoney(decimalAmount(row.cents), currency)} gross</span></li>)}</ul>}
      <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" disabled={pending} onClick={() => setReceiving(false)}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? "Recording funding…" : "Confirm funding received"}</Button></div>
    </form>}
    {(receipts.length > 0 || uses.length > 0) && <div className="space-y-3">
      <h3 className="text-sm font-semibold">Funding history</h3>
      <ul className="divide-y border-y">
        {receipts.map(row => <li key={row.id} className="space-y-2 py-3">
          <div className="flex flex-wrap justify-between gap-2"><div className="min-w-0"><p className="text-sm font-medium">Funding received · {sponsorshipMoney(row.amount, currency)}{row.reversedAt ? " · Reversed" : ""}</p><p className="text-xs text-muted-foreground">{formatDate(row.receivedDate)} · {sponsorshipMoney(row.actualNetAmount, currency)} available after fees</p></div>
            {!row.reversedAt && <Button size="sm" variant="ghost" disabled={pending} onClick={() => { setCorrection({ kind: "receipt", id: row.id }); setReason(""); setError(null); }}>Correct payment</Button>}
          </div>
          {(row.note || row.reversalReason) && <p className="break-words text-sm text-muted-foreground">{row.note}{row.reversalReason ? ` · Reversed: ${row.reversalReason}` : ""}</p>}
        </li>)}
        {uses.map(row => <li key={row.id} className="space-y-2 py-3">
          <div className="flex flex-wrap justify-between gap-2"><div className="min-w-0"><p className="text-sm font-medium">Funds used · {sponsorshipMoney(row.amount, currency)}{row.reversedAt ? " · Reversed" : ""}</p><p className="text-xs text-muted-foreground">{formatDate(row.usedDate)} · {row.projectTitle}</p></div>
            {!row.reversedAt && <Button size="sm" variant="ghost" disabled={pending} onClick={() => { setCorrection({ kind: "use", id: row.id }); setReason(""); setError(null); }}>Correct use</Button>}
          </div><p className="break-words text-sm text-muted-foreground">{row.note}{row.reversalReason ? ` · Reversed: ${row.reversalReason}` : ""}</p>
        </li>)}
      </ul>
    </div>}
    {correction && <form className="space-y-3 rounded-lg bg-muted/30 p-3" onSubmit={event => {
      event.preventDefault();
      run(() => correction.kind === "receipt" ? reverseSponsorshipReceipt(record.id, correction.id, reason) : reverseSponsorshipFundUse(record.id, correction.id, reason),
        "Correction recorded. The original entry remains in history.", () => setCorrection(null));
    }}>
      <p className="text-sm font-medium">{correction.kind === "receipt" ? "Reverse this payment" : "Reverse this use of funds"}</p>
      <p className="text-sm text-muted-foreground">The balance will update. The original entry and your reason stay in the history.</p>
      <Label htmlFor="fund-correction-reason">Reason for correction</Label><Textarea id="fund-correction-reason" required maxLength={1000} disabled={pending} value={reason} onChange={event => setReason(event.target.value)} />
      <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" disabled={pending} onClick={() => setCorrection(null)}>Cancel</Button><Button type="submit" variant="destructive" disabled={pending || !reason.trim()}>{pending ? "Recording correction…" : "Confirm reversal"}</Button></div>
    </form>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}
