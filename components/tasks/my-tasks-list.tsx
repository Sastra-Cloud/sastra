"use client";

import { confirmDialog } from "@/lib/dialog-requests";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Flag, Repeat2, ShieldCheck, Trash2 } from "lucide-react";

import type { MyTaskRow } from "@/lib/tasks/queries";
import { deleteTask, updateTaskStatus } from "@/lib/tasks/actions";
import { PriorityBadge, TaskStatusBadge } from "@/components/badges";
import { TaskCompleteButton } from "@/components/tasks/task-complete-button";
import { Badge } from "@/components/ui/badge";
import { dueLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { usePropState } from "@/hooks/use-prop-state";
import { TaskDetailDialog } from "@/components/tasks/task-detail-dialog";
import { TaskAttachmentShortcut } from "@/components/tasks/task-attachment-shortcut";

type Option = { id: string; name: string };
type TaskEditorOptions = {
  assignees: Option[];
  projects: Option[];
  currentUserId: string;
  canManage: boolean;
};

// House ease + spring for list reflow when a row leaves.
const EASE = [0.22, 1, 0.36, 1] as const;
const ROW_SPRING = { type: "spring", stiffness: 380, damping: 32 } as const;

export function MyTasksList({
  tasks,
  onOpen,
  editor,
  emptyTitle = "You're all caught up 🎉",
  emptyDescription = "New tasks assigned to you will show up here.",
}: {
  tasks: MyTaskRow[];
  /** When set, the title becomes a button that opens the task detail editor. */
  onOpen?: (task: MyTaskRow) => void;
  /** Self-contained editor used by server-rendered lists such as Dashboard. */
  editor?: TaskEditorOptions;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [visibleTasks, setVisibleTasks] = usePropState(tasks);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const detailTask = detailTaskId
    ? visibleTasks.find((task) => task.id === detailTaskId) ?? null
    : null;

  const markDone = (task: MyTaskRow) => {
    const previous = visibleTasks;
    setVisibleTasks((current) => current.filter((item) => item.id !== task.id));
    start(async () => {
      try {
        await updateTaskStatus(task.id, "done");
        router.refresh();
      } catch (error) {
        setVisibleTasks(previous);
        toast.error(error instanceof Error ? error.message : "Could not complete the task.");
      }
    });
  };

  const removeTask = async (task: MyTaskRow) => {
    if (!(await confirmDialog(`Delete task "${task.title}"? This cannot be undone.`))) return;
    const previous = visibleTasks;
    setVisibleTasks((current) => current.filter((item) => item.id !== task.id));
    start(async () => {
      try {
        await deleteTask(task.id);
        router.refresh();
      } catch (error) {
        setVisibleTasks(previous);
        toast.error(error instanceof Error ? error.message : "Could not delete the task.");
      }
    });
  };

  if (visibleTasks.length === 0) {
    return (
      <div className="rounded-lg border bg-card py-14 text-center">
        <p className="font-medium">{emptyTitle}</p>
        <p className="text-sm text-muted-foreground">{emptyDescription}</p>
      </div>
    );
  }

  return (
    <>
      <ul className="divide-y rounded-lg border bg-card" aria-busy={pending}>
        <AnimatePresence initial={false}>
          {visibleTasks.map((t) => {
            const due = dueLabel(t.dueDate);
            return (
          <motion.li
            key={t.id}
            layout
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.32, delay: 0.18, ease: EASE } }}
            transition={{ duration: 0.28, ease: EASE, layout: ROW_SPRING }}
            className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2 px-3 py-2.5 sm:flex sm:items-center sm:gap-3"
          >
            {t.approvalAssignmentId ? (
              <span className="row-span-2 flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary sm:row-auto">
                <ShieldCheck className="size-5" />
              </span>
            ) : (
              <TaskCompleteButton
                done={false}
                onToggle={() => markDone(t)}
                title={t.title}
                disabled={pending}
                hoverPreview
                className="row-span-2 flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-success focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:text-success sm:row-auto"
              />
            )}
            <div className="min-w-0 flex-1">
              {onOpen || editor ? (
                <button
                  type="button"
                  onClick={() => {
                    if (onOpen) onOpen(t);
                    else setDetailTaskId(t.id);
                  }}
                  className="line-clamp-2 max-w-full cursor-pointer text-left text-sm font-medium hover:underline sm:block sm:truncate"
                >
                  {t.isMilestone ? (
                    <Flag className="mr-1 inline size-3.5 text-warning" />
                  ) : null}
                  {t.title}
                </button>
              ) : (
                <p className="line-clamp-2 text-sm font-medium sm:block sm:truncate">
                  {t.isMilestone ? (
                    <Flag className="mr-1 inline size-3.5 text-warning" />
                  ) : null}
                  {t.title}
                </p>
              )}
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                {t.projectSlug ? (
                  <Link
                    href={`/projects/${t.projectSlug}/tasks`}
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    {t.projectTitle}
                  </Link>
                ) : (
                  <Badge variant="secondary" className="text-[10px]">
                    No project
                  </Badge>
                )}
                {t.phaseName ? (
                  <Badge variant="secondary" className="text-[10px]">
                    {t.phaseName}
                  </Badge>
                ) : null}
                {t.unitName ? (
                  <Badge variant="secondary" className="text-[10px]">
                    {t.unitName}
                  </Badge>
                ) : null}
                {t.sourceRecurringTaskId ? (
                  <Badge className="bg-info text-info-foreground text-[10px]">
                    <Repeat2 className="size-3" /> Recurring
                  </Badge>
                ) : null}
                {t.printPaymentId ? (
                  <Badge className="bg-warning text-warning-foreground text-[10px]">
                    Printer payment
                  </Badge>
                ) : null}
                {t.approvalAssignmentId ? (
                  <Badge className="bg-primary text-primary-foreground text-[10px]">
                    <ShieldCheck className="size-3" /> Budget approval
                  </Badge>
                ) : null}
              </div>
              <TaskAttachmentShortcut task={t} />
            </div>
            <div className="col-start-2 flex min-w-0 flex-wrap items-center gap-2 sm:ml-auto sm:shrink-0 sm:flex-nowrap">
              <span
                className={cn(
                  "text-xs",
                  due.tone === "overdue" && "font-medium text-destructive",
                  due.tone === "soon" && "text-warning",
                  due.tone === "normal" && "text-muted-foreground",
                  due.tone === "none" && "text-muted-foreground"
                )}
              >
                {due.text}
              </span>
              <PriorityBadge priority={t.priority} />
              <TaskStatusBadge status={t.status} />
              {!t.approvalAssignmentId ? (
                <button
                  type="button"
                  aria-label={`Delete "${t.title}"`}
                  title="Delete task"
                  onClick={() => removeTask(t)}
                  disabled={pending}
                  className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <Trash2 className="size-4" />
                </button>
              ) : null}
            </div>
          </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
      {editor ? (
        <TaskDetailDialog
          task={detailTask}
          assignees={editor.assignees}
          projects={editor.projects}
          currentUserId={editor.currentUserId}
          canManage={editor.canManage}
          onOptimisticUpdate={(fields) => {
            if (!detailTaskId) return undefined;
            const previous = visibleTasks.find((task) => task.id === detailTaskId);
            setVisibleTasks((current) =>
              current.map((task) =>
                task.id === detailTaskId ? { ...task, ...fields } : task
              )
            );
            return () => {
              if (!previous) return;
              setVisibleTasks((current) =>
                current.map((task) => (task.id === previous.id ? previous : task))
              );
            };
          }}
          onOptimisticDelete={() => {
            if (!detailTaskId) return undefined;
            const previous = visibleTasks.find((task) => task.id === detailTaskId);
            const previousIndex = visibleTasks.findIndex(
              (task) => task.id === detailTaskId
            );
            setVisibleTasks((current) =>
              current.filter((task) => task.id !== detailTaskId)
            );
            return () => {
              if (!previous) return;
              setVisibleTasks((current) => {
                const next = current.filter((task) => task.id !== previous.id);
                next.splice(Math.min(previousIndex, next.length), 0, previous);
                return next;
              });
            };
          }}
          onClose={() => setDetailTaskId(null)}
        />
      ) : null}
    </>
  );
}
