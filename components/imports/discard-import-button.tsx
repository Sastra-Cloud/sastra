"use client";

import { confirmDialog } from "@/lib/dialog-requests";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { discardImport } from "@/lib/imports/actions";
import { Button } from "@/components/ui/button";

/**
 * Cancel (while parsing/uploaded) or delete (otherwise) an import. Soft-discards
 * the row — the underlying file is kept — and refreshes the list.
 */
export function DiscardImportButton({
  importId,
  status,
  fileName,
}: {
  importId: string;
  status: string;
  fileName: string | null;
}) {
  const router = useRouter();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const cancel = status === "parsing" || status === "uploaded";
  const label = cancel ? "Cancel" : "Delete";

  async function run() {
    const ok = (await confirmDialog(`${label} “${fileName ?? "this document"}”?\n` +
        (cancel
          ? "Parsing will stop and the draft is removed."
          : "It will be removed from the list.")));
    if (!ok) return;
    const row = buttonRef.current?.closest("li");
    if (row instanceof HTMLElement) row.hidden = true;
    setBusy(true);
    try {
      await discardImport(importId);
      router.refresh();
    } catch (error) {
      if (row instanceof HTMLElement) row.hidden = false;
      toast.error(error instanceof Error ? error.message : `Could not ${label.toLowerCase()} the import.`);
      setBusy(false);
    }
  }

  return (
    <Button
      ref={buttonRef}
      size="sm"
      variant="ghost"
      className="size-7 p-0 text-muted-foreground hover:text-destructive"
      title={label}
      aria-label={`${label} import`}
      disabled={busy}
      onClick={run}
    >
      {busy ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Trash2 className="size-3.5" />
      )}
    </Button>
  );
}
