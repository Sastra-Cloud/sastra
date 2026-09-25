"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { refreshAllHealth, refreshProjectHealth } from "@/lib/blockers/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Manager button: recompute one project's blockers/health now. */
export function RefreshHealthButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="xs"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await refreshProjectHealth(projectId);
          if (res.error) toast.error(res.error);
          else if (res.skipped) toast.info("Already checked in the last 2 minutes.");
          else toast.success("Health recomputed");
          router.refresh();
        })
      }
    >
      <RefreshCw className={cn("size-3.5", pending && "animate-spin")} />
      Refresh
    </Button>
  );
}

/** Manager button: recompute every project (throttled server-side). */
export function RefreshAllHealthButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await refreshAllHealth();
          if (res.error) toast.error(res.error);
          else if (res.skipped)
            toast.info("Already recomputed in the last 10 minutes.");
          else toast.success(`Recomputed ${res.projects} projects`);
          router.refresh();
        })
      }
      className="inline-flex items-center gap-1 rounded text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
    >
      <RefreshCw className={cn("size-3", pending && "animate-spin")} />
      Recompute now
    </button>
  );
}
