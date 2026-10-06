"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PageHero } from "@/components/cockpit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OutgoingAttachmentReview } from "@/components/email/outgoing-attachment-review";
import { useOptimisticAction } from "@/hooks/use-optimistic-action";
import { confirmDialog } from "@/lib/dialog-requests";
import { cancelSponsorship, generateSponsorshipInvoice, updateSponsorship, voidSponsorshipInvoice } from "@/lib/sponsorships/actions";
import type { SponsorshipDetail as Detail } from "@/lib/sponsorships/queries";
import { sponsorshipTotalCents, type SponsorshipInput } from "@/lib/sponsorships/compute";
import { sponsorshipMoney, sponsorshipStatus } from "@/lib/sponsorships/format";
import { formatDate } from "@/lib/format";
import { SponsorshipForm, type SponsorshipOptions } from "./sponsorship-form";
import { SponsorshipFunding } from "./sponsorship-funding";
import { SponsorshipEmail } from "./sponsorship-email";

type Change = { kind: "edit"; input: SponsorshipInput; books: SponsorshipOptions["books"] } | { kind: "cancel" } | { kind: "void" };
function applyChange(current: Detail, change: Change): Detail {
  if (change.kind === "cancel") return { ...current, record: { ...current.record, status: "cancelled", version: current.record.version + 1 } };
  if (change.kind === "void") return { ...current, activeInvoice: null, invoiceFile: null,
    record: { ...current.record, status: "draft", version: current.record.version + 1 },
    invoiceHistory: current.invoiceHistory.map(invoice => invoice.id === current.activeInvoice?.id ? { ...invoice, status: "void" } : invoice) };
  return { ...current, record: { ...current.record, ...change.input, recipientEmail: change.input.recipientEmail || null,
    recipientAddress: change.input.recipientAddress || null, dueDate: change.input.dueDate || null, notes: change.input.notes || null,
    version: current.record.version + 1 }, lines: change.input.lines.map((line, index) => ({
      ...line, id: `pending-${index}`, projectTitle: change.books.find(book => book.id === line.projectId)?.title ?? "Book",
      projectSlug: change.books.find(book => book.id === line.projectId)?.slug ?? "",
    })) };
}
function draftInput(detail: Detail): SponsorshipInput {
  return { title: detail.record.title, partnerId: detail.record.partnerId, recipientName: detail.record.recipientName,
    recipientEmail: detail.record.recipientEmail ?? "", recipientAddress: detail.record.recipientAddress ?? "",
    currency: detail.record.currency, dueDate: detail.record.dueDate ?? "", notes: detail.record.notes ?? "",
    lines: detail.lines.map(({ projectId, description, quantity, unitPrice }) => ({ projectId, description, quantity, unitPrice })) };
}

export function SponsorshipDetail({ detail, options, defaultCc, today }: { detail: Detail; options: SponsorshipOptions; defaultCc: string[]; today: string }) {
  const router = useRouter();
  const optimistic = useOptimisticAction<Detail, Change>({ state: detail, update: applyChange });
  const visible = optimistic.state;
  const { record, activeInvoice: invoice } = visible;
  const [editing, setEditing] = useState(false);
  const [failedInput, setFailedInput] = useState<SponsorshipInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [generating, startGeneration] = useTransition();
  const total = sponsorshipTotalCents(visible.lines) / 100;
  const received = visible.receipts.filter(receipt => !receipt.reversedAt).reduce((sum, receipt) => sum + Number(receipt.amount), 0);
  const activeReceipts = visible.receipts.filter(receipt => !receipt.reversedAt);
  const noReceipts = !activeReceipts.length;
  function failure(message: string) { setError(message); }
  return <div className="space-y-6">
    <PageHero title={record.title} description={record.recipientName} actions={record.status === "draft" ? <>
      <Button variant="outline" disabled={optimistic.pending || generating || editing} onClick={() => { setEditing(true); setFailedInput(null); setError(null); setReviewed(false); }}>Edit sponsorship</Button>
      <Button variant="ghost" disabled={optimistic.pending || generating || editing} onClick={async () => {
        if (!await confirmDialog("Cancel this sponsorship draft? Its history will be kept.")) return;
        setError(null);
        optimistic.run({ kind: "cancel" }, () => cancelSponsorship(record.id), { onError: failure, onSuccess: () => router.refresh() });
      }}>Cancel sponsorship</Button>
    </> : undefined}>
      <div className="flex flex-wrap items-center justify-between gap-3"><Badge variant="secondary">{sponsorshipStatus(record.status, invoice?.status ?? null, String(received))}</Badge>
        <p className="text-sm font-semibold tabular-nums">Invoice total: {sponsorshipMoney(total, record.currency)}</p></div>
    </PageHero>
    <Link href="/sponsorships" className="inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4">Back to sponsorships</Link>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {editing ? <SponsorshipForm initial={failedInput ?? draftInput(visible)} options={options} pending={optimistic.pending} onCancel={() => setEditing(false)} onSave={input => {
      setEditing(false); setError(null); setReviewed(false);
      optimistic.run({ kind: "edit", input, books: options.books }, () => updateSponsorship(record.id, record.version, input), {
        onError: message => { failure(message); setFailedInput(input); setEditing(true); router.refresh(); },
        onSuccess: () => { toast.success("Sponsorship saved."); router.refresh(); },
      });
    }} /> : <section className="space-y-4 rounded-xl border bg-card p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold">{invoice ? `Invoice ${invoice.invoiceNumber}` : "Review sponsorship invoice"}</h2>
        {optimistic.pending && <p role="status" className="text-sm text-muted-foreground">Saving change…</p>}</div>
      <div className="grid gap-4 text-sm sm:grid-cols-2"><div><p className="text-muted-foreground">Bill to</p><p className="mt-1 font-medium">{record.recipientName}</p>{record.recipientAddress && <p className="mt-1 whitespace-pre-wrap break-words">{record.recipientAddress}</p>}</div>
        <div><p className="text-muted-foreground">Payment due</p><p className="mt-1">{record.dueDate ? formatDate(record.dueDate) : "No due date"}</p>{invoice && <p className="mt-1 text-muted-foreground">Issued {formatDate(invoice.issueDate)}</p>}</div></div>
      <ul className="divide-y border-y">{visible.lines.map(line => <li key={line.id} className="flex flex-col justify-between gap-2 py-3 text-sm sm:flex-row sm:gap-6">
        <div className="min-w-0"><p className="break-words font-medium">{line.description}</p><p className="mt-1 text-muted-foreground">{line.quantity.toLocaleString("en-US")} copies × {sponsorshipMoney(line.unitPrice, record.currency)}</p></div>
        <p className="shrink-0 font-medium tabular-nums">{sponsorshipMoney(Number(line.unitPrice) * line.quantity, record.currency)}</p>
      </li>)}</ul>
      {record.notes && <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{record.notes}</p>}
      {record.status === "draft" && <div className="space-y-3">
        <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="size-4 shrink-0 accent-primary" checked={reviewed} disabled={generating || optimistic.pending}
          onChange={event => setReviewed(event.target.checked)} />I reviewed the partner, books, prices, and total.</label>
        <Button disabled={!reviewed || generating || optimistic.pending} onClick={() => {
          setError(null);
          startGeneration(async () => {
            try {
              const result = await generateSponsorshipInvoice(record.id, record.version);
              if (result.error) { setError(result.error); return; }
              toast.success("Invoice generated. Review it before sending."); setReviewed(false); router.refresh();
            } catch { setError("Couldn't generate the invoice. Refresh to check its status before trying again."); }
          });
        }}>{generating ? "Generating invoice…" : "Generate invoice"}</Button>
        <p className="text-xs text-muted-foreground">Generating an invoice does not send it. <Link href="/settings/workspace" className="text-primary underline underline-offset-4">Check invoice settings</Link>.</p>
      </div>}
      {invoice && <>
        <OutgoingAttachmentReview ariaLabel="Invoice PDF" helperText="Saved invoice PDF. Review it before sending." attachments={[{ name: visible.invoiceFile?.originalName ?? `invoice-${invoice.invoiceNumber}.pdf`, mimeType: "application/pdf", sizeBytes: visible.invoiceFile?.sizeBytes,
          previewUrl: `/api/invoices/${invoice.id}?inline=1`, description: `Invoice ${invoice.invoiceNumber}` }]} />
        <div className="flex flex-wrap gap-2">
          {invoice.status === "issued" && <Button disabled={optimistic.pending || emailOpen} onClick={() => setEmailOpen(true)}>{visible.draft ? "Resume invoice email" : "Review and send invoice"}</Button>}
          {invoice.status === "sending" && <><p role="status" className="w-full text-sm text-muted-foreground">Delivery is unresolved. Check Correspondence before retrying.</p><Link href="/correspondence" className="text-sm text-primary underline underline-offset-4">Open Correspondence</Link></>}
          {noReceipts && ["issued", "sent"].includes(invoice.status) && <Button variant="outline" disabled={optimistic.pending} onClick={async () => {
            if (!await confirmDialog(`Void invoice ${invoice.invoiceNumber}? The original PDF and delivery history will be kept.`)) return;
            setEmailOpen(false); setReviewed(false); setError(null);
            optimistic.run({ kind: "void" }, () => voidSponsorshipInvoice(record.id), { onError: failure, onSuccess: () => router.refresh() });
          }}>Void invoice</Button>}
        </div>
      </>}
    </section>}
    {emailOpen && invoice && <SponsorshipEmail key={invoice.id} detail={visible} defaultCc={defaultCc} onClose={() => setEmailOpen(false)} />}
    {(record.status === "invoiced" || visible.receipts.length > 0 || visible.uses.length > 0) && <SponsorshipFunding detail={visible} today={today} />}
    {visible.invoiceHistory.some(invoice => invoice.status === "void") && <section className="space-y-2"><h2 className="text-base font-semibold">Previous invoices</h2><ul className="space-y-2">{visible.invoiceHistory.filter(invoice => invoice.status === "void").map(invoice => <li key={invoice.id}><a href={`/api/invoices/${invoice.id}`} target="_blank" rel="noreferrer" className="text-sm text-primary underline underline-offset-4">Invoice {invoice.invoiceNumber} · void</a></li>)}</ul></section>}
  </div>;
}
