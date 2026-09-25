"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarRange, ChevronDown } from "lucide-react";

import type { MyTaskRow } from "@/lib/tasks/queries";
import { MyTasksList } from "@/components/tasks/my-tasks-list";
import { TaskDetailDialog } from "@/components/tasks/task-detail-dialog";
import { CreateTaskDialog } from "@/components/tasks/create-task-dialog";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { splitTasksByAttention } from "@/lib/tasks/attention";
import { cn } from "@/lib/utils";

type Option = { id: string; name: string };

/** Personal task hub: your actionable list (incl. general/no-project tasks). */
export function TasksHub({
  myTasks,
  todayIso,
  assignees,
  projects,
  currentUserId,
  canManage,
}: {
  myTasks: MyTaskRow[];
  todayIso: string;
  assignees: Option[];
  projects: Option[];
  currentUserId: string;
  canManage: boolean;
}) {
  const searchParams = useSearchParams();
  // Deep link: /tasks?task=<id> (e.g. from a mention notification) opens it.
  const [detailTask, setDetailTask] = useState<MyTaskRow | null>(() => {
    const id = searchParams.get("task");
    return id ? myTasks.find((task) => task.id === id) ?? null : null;
  });
  const [showLater, setShowLater] = useState(false);
  const { attention, later } = splitTasksByAttention(myTasks, todayIso);
  const nextLaterDate = later
    .map((task) => task.dueDate)
    .filter((date): date is string => !!date)
    .sort()[0];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <CreateTaskDialog
          assignees={assignees}
          projects={projects}
          defaultAssignee={currentUserId}
          triggerLabel="Create task"
        />
      </div>

      <section className="space-y-2" aria-labelledby="needs-attention-heading">
        <div className="flex items-baseline justify-between gap-3">
          <h2
            id="needs-attention-heading"
            className="font-heading text-lg font-semibold"
          >
            Needs attention
          </h2>
          <span className="text-xs text-muted-foreground">
            Next 30 days and active work
          </span>
        </div>
        <MyTasksList
          tasks={attention}
          onOpen={setDetailTask}
          emptyTitle="Nothing needs attention right now"
          emptyDescription={
            later.length > 0
              ? "Future tasks will move here automatically as they approach."
              : "New tasks assigned to you will show up here."
          }
        />
      </section>

      {later.length > 0 ? (
        <section className="space-y-2" aria-labelledby="later-tasks-heading">
          <Button
            type="button"
            variant="outline"
            className="h-auto min-h-12 w-full justify-between rounded-lg px-3 py-2.5"
            aria-expanded={showLater}
            aria-controls="later-task-list"
            onClick={() => setShowLater((value) => !value)}
          >
            <span className="flex min-w-0 items-center gap-3 text-left">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <CalendarRange className="size-4" />
              </span>
              <span className="min-w-0">
                <span id="later-tasks-heading" className="block font-medium">
                  Later · {later.length}
                </span>
                <span className="block truncate text-xs font-normal text-muted-foreground">
                  {nextLaterDate
                    ? `Next planned date ${formatDate(nextLaterDate)}`
                    : "Future work kept out of your active queue"}
                </span>
              </span>
            </span>
            <ChevronDown
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform",
                showLater && "rotate-180"
              )}
            />
          </Button>
          {showLater ? (
            <div id="later-task-list">
              <MyTasksList tasks={later} onOpen={setDetailTask} />
            </div>
          ) : null}
        </section>
      ) : null}

      <TaskDetailDialog
        task={detailTask}
        assignees={assignees}
        projects={projects}
        currentUserId={currentUserId}
        canManage={canManage}
        onClose={() => {
          setDetailTask(null);
          if (searchParams.get("task")) {
            const url = new URL(window.location.href);
            url.searchParams.delete("task");
            window.history.replaceState(null, "", url);
          }
        }}
      />
    </div>
  );
}
