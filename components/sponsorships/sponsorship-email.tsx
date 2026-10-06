"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { confirmDialog } from "@/lib/dialog-requests";
import { sendInvoiceEmail } from "@/lib/budget/actions";
import { saveEmailDraft } from "@/lib/email/draft-actions";
import type { SponsorshipDetail } from "@/lib/sponsorships/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { OutgoingAttachmentReview } from "@/components/email/outgoing-attachment-review";

export function SponsorshipEmail({ detail, defaultCc, onClose }: { detail: SponsorshipDetail; defaultCc: string[]; onClose: () => void }) {
  const { activeInvoice: invoice, invoiceFile, draft } = detail;
  const router = useRouter();
  const [to, setTo] = useState(draft?.toAddresses[0] ?? invoice?.recipientEmail ?? "");
  const [cc, setCc] = useState((draft?.ccAddresses ?? defaultCc).join(", "));
  const [subject, setSubject] = useState(draft?.subject ?? `Sponsorship invoice ${invoice?.invoiceNumber ?? ""}`);
  const [body, setBody] = useState(draft?.body ?? `Hello,\n\nPlease find the attached invoice for ${detail.record.title}.\n\nThank you for supporting these books.`);
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(!!draft);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const [operation, setOperation] = useState<"save" | "send" | null>(null);
  if (!invoice) return null;
  const invoiceId = invoice.id;
  const projectId = invoice.projectId;
  const snapshotFileId = invoice.renderedFileId;
  const ccEmails = cc.split(/[,;\n]+/).map(value => value.trim()).filter(Boolean);
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const emailValid = validEmail.test(to.trim()) && ccEmails.every(value => validEmail.test(value)) && subject.trim() && body.trim();
  function saveInput() {
    return { projectId, kind: "mou_invoice" as const, contextId: invoiceId, toAddresses: to.trim() ? [to.trim()] : [],
      ccAddresses: ccEmails, subject, body, baselineSubject: null, baselineBody: null };
  }
  function mutate(kind: "save" | "send") {
    if (!invoice) return;
    setError(null); setOperation(kind);
    start(async () => {
      try {
        const savedDraft = await saveEmailDraft(saveInput());
        if (savedDraft.error) { setError(savedDraft.error); return; }
        setSaved(true); setDirty(false);
        if (kind === "save") { toast.success("Invoice email draft saved."); return; }
        const result = await sendInvoiceEmail(invoiceId, { confirmed: true, reviewedFileId: snapshotFileId ?? undefined,
          recipientEmail: to.trim(), ccEmails, subject, body });
        if (result.error) { setError(result.error); return; }
        toast.success("Sponsorship invoice sent."); onClose();
      } catch { setError("Delivery may be unresolved. Check Correspondence before sending again. Your email draft is saved if the save completed."); }
      finally { setOperation(null); router.refresh(); }
    });
  }
  return <section className="space-y-4 rounded-xl border bg-card p-4 md:p-5">
    <div className="space-y-1"><h2 className="text-base font-semibold">Review invoice email</h2><p className="text-sm text-muted-foreground">Check the invoice, recipient, and message. Sending requires your confirmation.</p></div>
    <fieldset disabled={pending} className="grid gap-3 sm:grid-cols-2" onChange={() => { setReviewed(false); setSaved(false); setDirty(true); }}>
      <div className="grid gap-1.5"><Label htmlFor="sponsorship-send-to">To</Label><Input className="min-h-11" id="sponsorship-send-to" type="email" value={to} onChange={event => setTo(event.target.value)} /></div>
      <div className="grid gap-1.5"><Label htmlFor="sponsorship-send-cc">CC (optional)</Label><Input className="min-h-11" id="sponsorship-send-cc" value={cc} onChange={event => setCc(event.target.value)} /><p className="text-xs text-muted-foreground">Separate email addresses with commas.</p></div>
      <div className="grid gap-1.5 sm:col-span-2"><Label htmlFor="sponsorship-send-subject">Subject</Label><Input className="min-h-11" id="sponsorship-send-subject" maxLength={500} value={subject} onChange={event => setSubject(event.target.value)} /></div>
      <div className="grid gap-1.5 sm:col-span-2"><Label htmlFor="sponsorship-send-body">Message</Label><Textarea id="sponsorship-send-body" rows={7} maxLength={20000} value={body} onChange={event => setBody(event.target.value)} /></div>
    </fieldset>
    <OutgoingAttachmentReview attachments={[{ name: invoiceFile?.originalName ?? `invoice-${invoice.invoiceNumber}.pdf`, mimeType: "application/pdf", sizeBytes: invoiceFile?.sizeBytes,
      previewUrl: `/api/invoices/${invoice.id}?inline=1`, description: `Invoice ${invoice.invoiceNumber}` }]} />
    {invoice.status === "issued" ? <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="size-4 shrink-0 accent-primary" checked={reviewed} disabled={pending}
      onChange={event => setReviewed(event.target.checked)} />I reviewed this invoice, To, CC, and message and confirm sending.</label>
      : <p role="status" className="text-sm text-muted-foreground">This invoice is {invoice.status === "sending" ? "awaiting delivery confirmation" : invoice.status}. Check Correspondence before taking further action.</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="flex flex-wrap items-center justify-end gap-2">
      {saved && <p role="status" className="mr-auto text-xs text-muted-foreground">Draft saved</p>}
      <Button variant="ghost" disabled={pending} onClick={async () => { if (!dirty || await confirmDialog("Close without saving your email changes?")) onClose(); }}>Close email</Button>
      <Button variant="outline" disabled={pending || (to.trim() !== "" && !validEmail.test(to.trim())) || !ccEmails.every(value => validEmail.test(value))} onClick={() => mutate("save")}>{pending && operation === "save" ? "Saving draft…" : "Save draft"}</Button>
      <Button disabled={pending || !reviewed || !emailValid || invoice.status !== "issued"} onClick={() => mutate("send")}>{pending && operation === "send" ? "Sending invoice…" : "Confirm and send invoice"}</Button>
    </div>
  </section>;
}
