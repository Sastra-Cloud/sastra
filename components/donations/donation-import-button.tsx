"use client";

import { useRef, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { DonationCsvFormatDialog } from "@/components/donations/donation-csv-format-dialog";
import { Button } from "@/components/ui/button";
import { createDonationImportFromFile } from "@/lib/donations/actions";
import type {
  DonationCsvFormatProposal,
  DonationImportResult,
} from "@/lib/donations/types";
import { uploadDonationCsv } from "@/lib/files/upload-client";

export function DonationImportButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [stage, setStage] = useState<"idle" | "uploading" | "checking">("idle");
  const [proposal, setProposal] = useState<DonationCsvFormatProposal | null>(
    null
  );

  function finish(result: DonationImportResult) {
    if (result.error) {
      toast.error(result.error);
      if (result.alreadyImported) router.refresh();
      return;
    }
    const added = result.newRows ?? 0;
    const skipped = result.exactDuplicateRows ?? 0;
    const possible = result.possibleDuplicateRows ?? 0;
    toast.success(
      `Added ${added} donation${added === 1 ? "" : "s"}. Skipped ${skipped} exact duplicate${
        skipped === 1 ? "" : "s"
      }${possible ? ` · ${possible} need duplicate review` : ""}.`
    );
    router.refresh();
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Choose a CSV file.");
      return;
    }
    setStage("uploading");
    const fileId = await uploadDonationCsv(file);
    if (!fileId) {
      setStage("idle");
      return;
    }
    setStage("checking");
    const result: DonationImportResult = await createDonationImportFromFile(
      fileId
    ).catch(() => ({
      error: "Couldn't check the file. Check your internet and try again.",
    }));
    setStage("idle");
    if (inputRef.current) inputRef.current.value = "";
    if (result.needsFormat) {
      setProposal(result.needsFormat);
      return;
    }
    finish(result);
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={(event) => importFile(event.target.files?.[0])}
      />
      <Button
        type="button"
        disabled={stage !== "idle" || proposal !== null}
        onClick={() => inputRef.current?.click()}
      >
        {stage === "idle" ? (
          <>
            <FileUp className="size-4" />
            Import CSV
          </>
        ) : (
          <>
            <Loader2 className="size-4 animate-spin" />
            {stage === "uploading" ? "Uploading CSV…" : "Checking donations…"}
          </>
        )}
      </Button>
      {proposal ? (
        <DonationCsvFormatDialog
          key={proposal.fileId}
          proposal={proposal}
          onClose={() => setProposal(null)}
          onImported={(result) => {
            setProposal(null);
            finish(result);
          }}
        />
      ) : null}
    </>
  );
}
