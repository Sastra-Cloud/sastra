"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Zap } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { updateTypesafeEnabled } from "@/lib/ai/usage-actions";

export function TypesafeToggle({
  defaultEnabled,
  configured,
}: {
  defaultEnabled: boolean;
  configured: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(defaultEnabled);
  const [pending, start] = useTransition();

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    start(async () => {
      try {
        await updateTypesafeEnabled({ enabled: next });
        router.refresh();
      } catch {
        setEnabled(!next);
        toast.error("Couldn't update setting");
      }
    });
  };

  return (
    <section
      aria-labelledby="fast-pre-checks-heading"
      className="overflow-hidden rounded-xl border bg-card"
    >
      <div className="flex min-h-20 items-start gap-3 px-4 py-4 sm:px-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Zap className="size-5" />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3
              id="fast-pre-checks-heading"
              className="font-heading text-base font-medium"
            >
              Fast AI pre-checks
            </h3>
            <Badge variant="outline">Super admin</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            A small, fast AI model checks emails and assistant questions before
            the main AI runs. This skips AI calls that are not needed and lowers
            costs. Turn it off to go back to the standard behavior.
          </p>
          {configured ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={enabled}
                disabled={pending}
                onChange={toggle}
              />
              Use fast AI pre-checks
            </label>
          ) : (
            <p className="text-xs text-muted-foreground">
              The TypeSafe API key is not set up on this server.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
