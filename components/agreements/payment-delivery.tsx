"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { confirmSharedMouDelivery } from "@/lib/agreements/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PaymentDelivery({ paymentId, requirements, initialEvidence, confirmedAt, fileOptions }: {
  paymentId: string; requirements: string[]; initialEvidence: Array<{ requirement: string; url: string; fileId?: string }>;
  confirmedAt: Date | null;
  fileOptions: Array<{ fileId: string; originalName: string }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [links, setLinks] = useState(() => requirements.map((requirement) => initialEvidence.find((row) => row.requirement === requirement)?.url ?? ""));
  const [selectedFiles, setSelectedFiles] = useState(() => requirements.map((requirement) => initialEvidence.find((row) => row.requirement === requirement)?.fileId ?? ""));
  const [confirmed, setConfirmed] = useState(false);
  return <div className="space-y-3 border-t pt-3">
    <p className="text-sm font-medium">Delivery evidence {confirmedAt ? "· confirmed" : "· manager confirmation required"}</p>
    {requirements.map((requirement, index) => <label key={requirement} className="grid gap-1 text-sm">{requirement}
      <select aria-label={`Evidence file for ${requirement}`} className="h-9 min-w-0 rounded-md border bg-background px-2" value={selectedFiles[index]} onChange={(event) => { setSelectedFiles((current) => current.map((value, i) => i === index ? event.target.value : value)); setConfirmed(false); }}>
        <option value="">Choose an uploaded file</option>
        {fileOptions.map((file) => <option key={file.fileId} value={file.fileId}>{file.originalName}</option>)}
      </select>
      <Input type="url" placeholder="https://…" value={links[index]} onChange={(event) => { setLinks((current) => current.map((value, i) => i === index ? event.target.value : value)); setConfirmed(false); }} />
    </label>)}
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I verified that this evidence covers every required deliverable and delivery is complete.</label>
    <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => {
      try { const result = await confirmSharedMouDelivery({ paymentId, confirmed, evidence: requirements.flatMap((requirement, index) => links[index]?.trim() || selectedFiles[index] ? [{ requirement, url: links[index].trim(), fileId: selectedFiles[index] || undefined }] : []) });
        if (result.error) toast.error(result.error); else { toast.success(confirmed ? "Delivery confirmed." : "Evidence saved; confirmation cleared."); router.refresh(); }
      } catch { toast.error("Could not save delivery evidence. Your links are preserved."); }
    })}>{pending ? "Saving delivery review…" : confirmed ? "Confirm delivery" : "Save evidence without confirmation"}</Button>
  </div>;
}
