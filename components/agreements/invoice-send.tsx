"use client";
import { OutgoingAttachmentReview } from "@/components/email/outgoing-attachment-review";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { sendInvoiceEmail } from "@/lib/budget/actions";
import { saveEmailDraft } from "@/lib/email/draft-actions";
import type { EmailDraftDTO } from "@/lib/email/draft-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function AgreementInvoiceSend({ invoiceId, invoiceFileId, invoiceNumber, recipient, projectId, defaultCc, draft, evidence, enabled }: {
  invoiceId: string; invoiceFileId: string | null; invoiceNumber: string; recipient: string; projectId: string; defaultCc: string[];
  draft: EmailDraftDTO | null; evidence: Array<{ requirement: string; url: string; fileId?: string }>; enabled: boolean;
}) {
  const router = useRouter(); const [pending, start] = useTransition();
  const [to, setTo] = useState(draft?.toAddresses.join(", ") ?? recipient);
  const [cc, setCc] = useState((draft?.ccAddresses ?? defaultCc).join(", "));
  const [subject, setSubject] = useState(draft?.subject ?? `Invoice ${invoiceNumber}`);
  const [body, setBody] = useState(draft?.body ?? `Please find invoice ${invoiceNumber} attached.${evidence.length ? "\n\nDelivery evidence:\n" + evidence.filter((item) => item.url).map((item) => `${item.requirement}: ${item.url}`).join("\n") : ""}`);
  const [reviewedFile, setReviewedFile] = useState<string | null>(null);
  const reviewed = !!invoiceFileId && reviewedFile === invoiceFileId;
  const addresses = (value: string) => value.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean);
  async function save() { return saveEmailDraft({ projectId, kind: "mou_invoice", contextId: invoiceId,
    evidence, toAddresses: addresses(to), ccAddresses: addresses(cc), subject, body, baselineSubject: null, baselineBody: null }); }
  return <details className="border-t pt-3"><summary className="cursor-pointer text-sm font-medium">Review and send invoice</summary>
    <div className="mt-3 space-y-3" onChange={() => setReviewedFile(null)}>
      <OutgoingAttachmentReview attachments={[
        { name: `Invoice ${invoiceNumber}.pdf`, mimeType: "application/pdf", previewUrl: `/api/invoices/${invoiceId}?version=${invoiceFileId}` },
        ...evidence.filter((item) => item.fileId).map((item) => ({ name: item.requirement, mimeType: "application/octet-stream", previewUrl: `/api/files/${item.fileId}/download` }))
      ]} />
      {evidence.filter((item) => item.url).map((item) => <p key={item.requirement} className="text-sm"><a href={item.url} target="_blank" rel="noreferrer" className="text-primary underline">{item.requirement}</a></p>)}
      <label className="grid gap-1 text-sm">To<Input value={to} onChange={(event) => setTo(event.target.value)} /></label>
      <label className="grid gap-1 text-sm">CC<Input value={cc} onChange={(event) => setCc(event.target.value)} /></label>
      <label className="grid gap-1 text-sm">Subject<Input value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
      <label className="grid gap-1 text-sm">Message<Textarea rows={7} value={body} onChange={(event) => setBody(event.target.value)} /></label>
    </div>
    <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewedFile(event.target.checked ? invoiceFileId : null)} />I reviewed To/CC, the message, invoice PDF, and delivery evidence. Send this email now.</label>
    <div className="mt-3 flex flex-wrap gap-2">
      <Button variant="outline" size="sm" disabled={pending} onClick={() => start(async () => { try { const result = await save(); if (result.error) toast.error(result.error); else toast.success("Draft saved."); } catch { toast.error("Could not save the draft."); } })}>Save draft</Button>
      <Button size="sm" disabled={pending || !reviewed || !enabled} onClick={() => start(async () => {
        try { const saved = await save(); if (saved.error) { toast.error(saved.error); return; }
          const result = await sendInvoiceEmail(invoiceId, { confirmed: true, reviewedFileId: invoiceFileId ?? undefined, evidence, recipientEmail: to.trim(), ccEmails: addresses(cc), subject, body });
          if (result.error) toast.error(result.error); else toast.success("Invoice sent.");
          router.refresh();
        } catch { toast.error("Delivery could not be confirmed. Your draft is saved. Check correspondence before retrying."); router.refresh(); }
      })}>{pending ? "Processing…" : "Confirm and send invoice"}</Button>
    </div>
  </details>;
}
