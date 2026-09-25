"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { setAutoStartTimer } from "@/lib/tasks/time-actions";

export function AutoTimerToggle({ defaultEnabled }: { defaultEnabled: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(defaultEnabled);
  const [pending, start] = useTransition();

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    start(async () => {
      try {
        await setAutoStartTimer(next);
        router.refresh();
      } catch {
        setEnabled(!next);
        toast.error("Couldn't update setting");
      }
    });
  };

  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        className="size-4"
        checked={enabled}
        disabled={pending}
        onChange={toggle}
      />
      Auto-start a timer when I move a task to &ldquo;In progress&rdquo;
    </label>
  );
}
