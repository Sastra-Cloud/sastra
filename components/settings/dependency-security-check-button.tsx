"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { runDependencySecurityCheck } from "@/lib/security/actions";

export function DependencySecurityCheckButton({
  configured,
  running,
}: {
  configured: boolean;
  running: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!running) return;
    const interval = window.setInterval(() => router.refresh(), 8_000);
    return () => window.clearInterval(interval);
  }, [router, running]);

  function run() {
    startTransition(async () => {
      try {
        const result = await runDependencySecurityCheck();
        if (!result.ok) {
          toast.error(result.error.message);
          return;
        }
        toast.success("Dependency security check started in GitHub.");
        router.refresh();
      } catch {
        toast.error("Could not start the dependency security check.");
      }
    });
  }

  const busy = pending || running;
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={!configured || busy}
      onClick={run}
    >
      {busy ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
      {pending ? "Starting check…" : running ? "Check running…" : "Check again"}
    </Button>
  );
}
