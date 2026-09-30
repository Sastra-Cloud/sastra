"use client";

import { toast } from "sonner";
import type { TaskHandoff } from "@/lib/projects/pipeline";

/** Only announce the next task after the server has saved the handoff. */
export function showTaskCompleted(result: { handoff?: TaskHandoff | null }, navigate: (href: string) => void, id?: string | number) {
  const next = result.handoff;
  toast.success("Task completed", {
    id,
    description: next ? `${next.title} · ${next.assigneeName ?? "Unassigned"}${next.dueDate ? ` · Due ${next.dueDate}` : ""}` : undefined,
    action: next ? { label: "Open next task", onClick: () => navigate(next.href) } : undefined,
  });
}
