"use client";

import { confirmDialog } from "@/lib/dialog-requests";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, CircleDollarSign, Flag, Repeat2, ShieldCheck, Trash2 } from "lucide-react";

import type { MyTaskRow } from "@/lib/tasks/queries";
import { showTaskCompleted } from "@/lib/tasks/completion-feedback";
import { deleteTask, updateTaskStatus } from "@/lib/tasks/actions";
import { PriorityBadge, TaskStatusBadge } from "@/components/badges";
import { TaskCompleteButton } from "@/components/tasks/task-complete-button";
import { Badge } from "@/components/ui/badge";
import { daysUntil, dueLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { usePropState } from "@/hooks/use-prop-state";
import { TaskDetailDialog } from "@/components/tasks/task-detail-dialog";
import { TaskAttachmentShortcut } from "@/components/tasks/task-attachment-shortcut";
import { printPaymentFollowUp, selectPersonalWork } from "@/lib/tasks/attention";
import { isSourceControlledTask, taskSourceLink } from "@/lib/tasks/task-source";

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
  homePreview = false,
  todayIso = new Date().toISOString().slice(0, 10),
  timeZone = "UTC",
  emptyTitle = "You're all caught up 🎉",
  emptyDescription = "New tasks assigned to you will show up here.",
}: {
  tasks: MyTaskRow[];
  /** When set, the title becomes a button that opens the task detail editor. */
  onOpen?: (task: MyTaskRow) => void;
  /** Self-contained editor used by server-rendered lists such as Dashboard. */
  editor?: TaskEditorOptions;
  /** All of today's work plus a short preview of the remaining queue. */
  homePreview?: boolean;
  todayIso?: string;
  timeZone?: string;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [visibleTasks, setVisibleTasks] = usePropState(tasks);
  const inFlight = useRef(new Set<string>());
  const [pendingIds, setPendingIds] = useState(new Set<string>());
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const detailTask = detailTaskId
    ? visibleTasks.find((task) => task.id === detailTaskId) ?? null
    : null;
  const { dueToday, ordered, later, waiting } = selectPersonalWork(
    visibleTasks, todayIso, timeZone
  );
  const openTasks = visibleTasks.filter(task => task.status !== "done");
  const overdueCount = openTasks.filter(task => (daysUntil(task.dueDate, todayIso) ?? 0) < 0).length;
  const dueThisWeek = openTasks.filter(task => {
    const days = daysUntil(task.dueDate, todayIso);
    return days !== null && days >= 0 && days <= 7;
  }).length;
  const nextTasks = ordered.slice(dueToday.length, dueToday.length + 3);
  const remaining = ordered.length - dueToday.length - nextTasks.length;
  const groups = homePreview
    ? [
        {
          id: "home-due-today",
          title: "Due today",
          description: "Today's deadlines and payment follow-ups",
          rows: dueToday,
        },
        {
          id: "home-next-tasks",
          title: "Your next tasks",
          description: "Continue started work, then review the remaining queue",
          rows: nextTasks,
        },
      ]
    : [{ id: "tasks", title: "", description: "", rows: visibleTasks }];

  const beginMutation = (id: string) => {
    if (inFlight.current.has(id)) return false;
    inFlight.current.add(id);
    setPendingIds(current => new Set(current).add(id));
    return true;
  };
  const endMutation = (id: string) => {
    inFlight.current.delete(id);
    setPendingIds(current => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  };
  const restoreTask = (task: MyTaskRow, previous: MyTaskRow[]) => {
    const followingIds = new Set(
      previous.slice(previous.findIndex(item => item.id === task.id) + 1).map(item => item.id)
    );
    setVisibleTasks(current => {
      const next = current.filter(item => item.id !== task.id);
      const nextIndex = next.findIndex(item => followingIds.has(item.id));
      next.splice(nextIndex < 0 ? next.length : nextIndex, 0, task);
      return next;
    });
  };

  const markDone = (task: MyTaskRow) => {
    if (!beginMutation(task.id)) return;
    const previous = visibleTasks;
    setVisibleTasks((current) => current.filter((item) => item.id !== task.id));
    const completionToast = toast.loading("Saving completion and checking the next step…");
    start(async () => {
      try {
        const result = await updateTaskStatus(task.id, "done");
        showTaskCompleted(result, href => router.push(href), completionToast);
        router.refresh();
      } catch (error) {
        restoreTask(task, previous);
        toast.error(error instanceof Error ? error.message : "Could not complete the task.", { id: completionToast });
      } finally {
        endMutation(task.id);
      }
    });
  };

  const removeTask = async (task: MyTaskRow) => {
    if (inFlight.current.has(task.id)) return;
    if (!(await confirmDialog(`Delete task "${task.title}"? This cannot be undone.`))) return;
    if (!beginMutation(task.id)) return;
    const previous = visibleTasks;
    setVisibleTasks((current) => current.filter((item) => item.id !== task.id));
    start(async () => {
      try {
        await deleteTask(task.id);
        router.refresh();
      } catch (error) {
        restoreTask(task, previous);
        toast.error(error instanceof Error ? error.message : "Could not delete the task.");
      } finally {
        endMutation(task.id);
      }
    });
  };

  if (!homePreview && visibleTasks.length === 0) {
    return (
      <div className="rounded-lg border bg-card py-14 text-center">
        <p className="font-medium">{emptyTitle}</p>
        <p className="text-sm text-muted-foreground">{emptyDescription}</p>
      </div>
    );
  }

  return (
    <>
      {homePreview ? (
        <p className="text-xs text-muted-foreground">
          {openTasks.length} open · {overdueCount} overdue · {" "}
          <Link href="/tasks?view=agenda" className="underline underline-offset-4">
            {dueThisWeek} due in the next 7 days
          </Link>
        </p>
      ) : null}
      {groups.map((group) => (
        <section
          key={group.id}
          className="space-y-2"
          aria-labelledby={homePreview ? `${group.id}-heading` : undefined}
        >
          {homePreview ? (
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 id={`${group.id}-heading`} className="text-lg font-semibold">
                  {group.title}{" "}
                  <span className="ml-2 text-sm font-normal tabular-nums text-muted-foreground">
                    {group.rows.length}
                  </span>
                </h2>
                <p className="text-xs text-muted-foreground">{group.description}</p>
              </div>
              {group.id === "home-due-today" ? (
                <Link
                  href="/tasks?view=focus#due-today"
                  className="inline-flex min-h-10 items-center gap-1 text-sm text-muted-foreground hover:underline"
                >
                  Open My Work <ArrowRight className="size-3.5" />
                </Link>
              ) : null}
            </div>
          ) : null}
          {group.rows.length > 0 ? (
            <ul className="divide-y rounded-lg border bg-card" aria-busy={pending}>
              <AnimatePresence initial={false}>
                {group.rows.map((t) => {
                  const followUp = printPaymentFollowUp(t, todayIso, timeZone);
                  const due = followUp
                    ? { text: `Follow up ${followUp.date}`, tone: followUp.state === "due" ? "soon" : "normal" }
                    : dueLabel(t.dueDate, todayIso);
                  const controlled = isSourceControlledTask(t);
                  const sourceLink = taskSourceLink(t, t.projectSlug);
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
                      {controlled ? (
                        <span className="row-span-2 flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary sm:row-auto">
                          {t.approvalAssignmentId ? <ShieldCheck className="size-5" /> : <CircleDollarSign className="size-5" />}
                        </span>
                      ) : (
                        <TaskCompleteButton
                          done={false}
                          onToggle={() => markDone(t)}
                          title={t.title}
                          disabled={pendingIds.has(t.id)}
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
                        {sourceLink ? <Link href={sourceLink.href} className="mt-1 block text-xs text-primary hover:underline">{sourceLink.label}</Link> : null}
                      </div>
                      <div className="col-start-2 flex min-w-0 flex-wrap items-center gap-2 sm:ml-auto sm:shrink-0 sm:flex-nowrap">
                        <span
                          className={cn(
                            "text-xs",
                            due.tone === "overdue" && "font-medium text-destructive",
                              due.tone === "soon" && "text-warning-text",
                            due.tone === "normal" && "text-muted-foreground",
                            due.tone === "none" && "text-muted-foreground"
                          )}
                        >
                          {due.text}
                        </span>
                        <PriorityBadge priority={t.priority} />
                        <TaskStatusBadge status={t.status} />
                        {followUp?.state === "due" ? <Badge variant="secondary">Follow up due</Badge> : null}
                        {!controlled ? (
                          <button
                            type="button"
                            aria-label={`Delete "${t.title}"`}
                            title="Delete task"
                            onClick={() => removeTask(t)}
                            disabled={pendingIds.has(t.id)}
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
          ) : (
            <p className="rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground">
              {group.id === "home-due-today"
                ? "No tasks due today"
                : "No other tasks need attention right now"}
            </p>
          )}
        </section>
      ))}
      {homePreview ? (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <Link href="/tasks" className="inline-flex min-h-10 items-center gap-1 hover:underline">
            {remaining > 0
              ? `${remaining} more needing attention · View all work`
              : later.length > 0
                ? `${later.length} planned for later · View all work`
                : "View all work"}
            <ArrowRight className="size-3.5" />
          </Link>
          {waiting.length > 0 ? (
            <Link href="/tasks?view=focus#waiting" className="inline-flex min-h-10 items-center hover:underline">
              {waiting.length} awaiting payment confirmation · View waiting work
            </Link>
          ) : null}
        </div>
      ) : null}
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
