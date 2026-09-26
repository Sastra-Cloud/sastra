"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { reviewEmailAttachmentAsDocument } from "@/lib/email/document-review-actions";

type Workflow = "project_document" | "rights_agreement" | "rights_receipt" | "print_quote";

export function ReviewEmailAttachmentButton({ threadId, attachmentId }: { threadId: string; attachmentId: string }) {
  const router = useRouter();
  const [workflow, setWorkflow] = useState<Workflow>("project_document");
  const [pending, setPending] = useState(false);
  return <div className="flex flex-wrap items-center gap-2">
    <select aria-label="Document workflow" className="min-h-10 max-w-full rounded-md border bg-background px-2 text-xs" value={workflow} disabled={pending} onChange={(event) => setWorkflow(event.target.value as Workflow)}>
      <option value="project_document">Agreement or invoice import</option>
      <option value="rights_agreement">Signed rights agreement</option>
      <option value="rights_receipt">License fee receipt</option>
      <option value="print_quote">Print quote</option>
    </select>
    <Button size="sm" variant="outline" disabled={pending} onClick={async () => {
      setPending(true);
      try {
        const result = await reviewEmailAttachmentAsDocument(threadId, attachmentId, workflow);
        if (result.error) throw new Error(result.error);
        if (result.importId) router.push(`/projects/import/${result.importId}`);
        else { toast.success("Document opened for review."); router.refresh(); }
      } catch (error) { toast.error(error instanceof Error ? error.message : "Could not open this document."); }
      finally { setPending(false); }
    }}>{pending ? "Opening…" : "Review as document"}</Button>
  </div>;
}
