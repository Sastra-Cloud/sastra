"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { startParse } from "@/lib/imports/actions";
import { Button } from "@/components/ui/button";

/** Re-run a failed parse from the list, then refresh to show the new status. */
export function RetryImportButton({ importId }: { importId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 px-2 text-xs"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await startParse(importId, { force: true });
        if (res.error) toast.error(res.error);
        router.refresh();
        setBusy(false);
      }}
    >
      {busy ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <RotateCcw className="size-3.5" />
      )}
      Retry
    </Button>
  );
}
