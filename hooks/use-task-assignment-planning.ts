"use client";

import { useState, useTransition, type Dispatch, type RefObject, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setTaskAssignmentDeferred } from "@/lib/tasks/actions";
import type { MyTaskRow } from "@/lib/tasks/queries";

/** Share the same row lock as completion/status edits; roll back only planning. */
export function useTaskAssignmentPlanning<T extends MyTaskRow>(
  setTasks: Dispatch<SetStateAction<T[]>>,
  inFlight: RefObject<Set<string>>,
) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [pendingIds, setPendingIds] = useState(new Set<string>());
  const deferAssignment = (task: T, deferred: boolean) => {
    if (inFlight.current.has(task.id)) return;
    inFlight.current.add(task.id);
    setPendingIds(current => new Set(current).add(task.id));
    const previous = task.assignmentDeferredAt;
    const patch = (assignmentDeferredAt: Date | null) => setTasks(current =>
      current.map(item => item.id === task.id ? { ...item, assignmentDeferredAt } : item)
    );
    patch(deferred ? new Date() : null);
    startTransition(async () => {
      try {
        const result = await setTaskAssignmentDeferred(
          task.id, deferred, task.assignedAt ? new Date(task.assignedAt).toISOString() : null,
        );
        patch(result.assignmentDeferredAt);
        router.refresh();
      } catch (error) {
        patch(previous);
        router.refresh();
        toast.error(error instanceof Error ? error.message : "Could not save. Try again.");
      } finally {
        inFlight.current.delete(task.id);
        setPendingIds(current => {
          const next = new Set(current);
          next.delete(task.id);
          return next;
        });
      }
    });
  };
  return { deferAssignment, pendingIds };
}
