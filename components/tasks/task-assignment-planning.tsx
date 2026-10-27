"use client";

import type { MyTaskRow } from "@/lib/tasks/queries";
import { isUndatedTeammateRequest } from "@/lib/tasks/assignment";
import { Button } from "@/components/ui/button";

export function TaskAssignmentPlanning<T extends MyTaskRow>({
  task, pending, onDeferredChange,
}: {
  task: T;
  pending: boolean;
  onDeferredChange: (task: T, deferred: boolean) => void;
}) {
  if (!isUndatedTeammateRequest(task) || task.isNextUp) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="min-w-0 break-words text-xs text-muted-foreground">
        Assigned by {task.assignedByName ?? "a teammate"}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => onDeferredChange(task, !task.assignmentDeferredAt)}
        aria-busy={pending}
        aria-label={`${pending ? "Saving task planning" : task.assignmentDeferredAt ? "Bring back" : "Move to Later"}: ${task.title}`}
      >
        {pending ? "Saving…" : task.assignmentDeferredAt ? "Bring back" : "Move to Later"}
      </Button>
    </div>
  );
}
