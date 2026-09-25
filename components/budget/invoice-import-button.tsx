"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { uploadFile } from "@/lib/files/upload-client";
import { createImportForPaymentInvoice } from "@/lib/imports/actions";

const ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.doc,.docx,application/pdf,image/png,image/jpeg," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Upload and AI-read a historical outgoing invoice for one receivable. */
export function InvoiceImportButton({
  paymentId,
  disabled = false,
}: {
  paymentId: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<"uploading" | "starting" | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setStage("uploading");
    const fileId = await uploadFile(file);
    if (inputRef.current) inputRef.current.value = "";
    if (!fileId) {
      setStage(null);
      return;
    }

    setStage("starting");
    const result = await createImportForPaymentInvoice(fileId, paymentId);
    if (result.error || !result.importId) {
      toast.error(result.error ?? "Could not read the invoice.");
      setStage(null);
      return;
    }
    router.push(`/projects/import/${result.importId}`);
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        hidden
        accept={ACCEPT}
        onChange={(event) => void onFile(event.target.files?.[0])}
      />
      <Button
        variant="outline"
        size="xs"
        disabled={disabled || stage !== null}
        onClick={() => inputRef.current?.click()}
      >
        {stage ? (
          <>
            <Loader2 className="size-3.5 animate-spin" />
            {stage === "uploading" ? "Uploading…" : "Starting AI…"}
          </>
        ) : (
          <>
            <FileUp className="size-3.5" />
            Upload paid invoice
          </>
        )}
      </Button>
    </>
  );
}
