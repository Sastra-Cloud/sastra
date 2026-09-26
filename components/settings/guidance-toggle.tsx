"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useGuidance } from "@/components/guidance/guidance-provider";
import { setGuidanceLevel } from "@/lib/settings/guidance-actions";

export function GuidanceToggle({ defaultEnabled }: { defaultEnabled: boolean }) {
  const guidance = useGuidance();
  const router = useRouter();
  const [enabled, setEnabled] = useState(defaultEnabled);
  const [pending, start] = useTransition();

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    start(async () => {
      try {
        await setGuidanceLevel(next ? "on" : "off");
        router.refresh();
      } catch {
        setEnabled(!next);
        toast.error("Couldn't update setting");
      }
    });
  };

  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4"
          checked={enabled}
          disabled={pending}
          onChange={toggle}
        />
        Show helpful guidance on each screen
      </label>
      <p className="text-xs text-muted-foreground">
        Guided steps and tips help you learn the app. Turn this off when you know
        the app well. You can also hide any single tip with its close button.
      </p>
      <Button type="button" variant="outline" size="sm" disabled={guidance.pending} onClick={guidance.reset}>Show hidden tips again</Button>
    </div>
  );
}
