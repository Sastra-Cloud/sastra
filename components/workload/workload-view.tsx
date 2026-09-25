"use client";

import { useMemo, useState } from "react";

import type { MyTaskRow } from "@/lib/tasks/queries";
import { TaskDetailDialog } from "@/components/tasks/task-detail-dialog";
import {
  WorkloadBoard,
  type WorkloadPerson,
} from "@/components/workload/workload-board";

type Option = { id: string; name: string };

/** Manager capacity view: per-person queues, now with clickable (actionable) tasks. */
export function WorkloadView({
  people,
  tasks,
  assignees,
  currentUserId,
}: {
  people: WorkloadPerson[];
  /** Full task rows so a clicked queue item can open the detail editor. */
  tasks: MyTaskRow[];
  assignees: Option[];
  currentUserId: string;
}) {
  const [detailTask, setDetailTask] = useState<MyTaskRow | null>(null);
  const byId = useMemo(() => {
    const m = new Map<string, MyTaskRow>();
    for (const t of tasks) m.set(t.id, t);
    return m;
  }, [tasks]);

  return (
    <>
      <WorkloadBoard
        people={people}
        onOpen={(id) => {
          const t = byId.get(id);
          if (t) setDetailTask(t);
        }}
      />
      <TaskDetailDialog
        task={detailTask}
        assignees={assignees}
        currentUserId={currentUserId}
        canManage
        onClose={() => setDetailTask(null)}
      />
    </>
  );
}
