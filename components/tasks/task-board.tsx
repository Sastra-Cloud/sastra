"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  AlertTriangle,
  Clock3,
  Flag,
  Folder,
  GripVertical,
  Lock,
  MoreHorizontal,
  Pencil,
  Play,
  Repeat2,
  ShieldCheck,
} from "lucide-react";

import type { TaskRow } from "@/lib/tasks/queries";
import {
  assignTask,
  deleteTask,
  setTaskDependencies,
  updateTaskFields,
  updateTaskStatus,
} from "@/lib/tasks/actions";
import { startTimer } from "@/lib/tasks/time-actions";
import { PriorityBadge, TASK_STATUS, TASK_STATUS_ORDER } from "@/components/badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CreateTaskDialog } from "@/components/tasks/create-task-dialog";
import { TaskDetailDialog } from "@/components/tasks/task-detail-dialog";
import { TaskAttachmentShortcut } from "@/components/tasks/task-attachment-shortcut";
import { offerToLearnTerms } from "@/components/tasks/learn-terms";
import { HelpTip } from "@/components/ui/help-tip";
import { REVIEW_SLA_DAYS, TASK_WIP_LIMITS, reviewAgeDays } from "@/lib/flow";
import { dueLabel } from "@/lib/format";
import { compareTaskBoardDueDate } from "@/lib/tasks/board-order";
import { cn } from "@/lib/utils";
import { usePropState } from "@/hooks/use-prop-state";
import { useOptimisticAction } from "@/hooks/use-optimistic-action";
import { useActiveTimer } from "@/components/time/active-timer-provider";

type Option = { id: string; name: string };
type TaskMutation =
  | { type: "status"; taskId: string; status: string; updatedAt: Date }
  | { type: "patch"; taskId: string; fields: Partial<TaskRow> }
  | { type: "delete"; taskId: string };

function applyTaskMutation(current: TaskRow[], mutation: TaskMutation) {
  if (mutation.type === "delete") {
    return current.filter((task) => task.id !== mutation.taskId);
  }
  return current.map((task) => {
    if (task.id !== mutation.taskId) return task;
    if (mutation.type === "patch") return { ...task, ...mutation.fields };
    return {
      ...task,
      status: mutation.status,
      updatedAt: mutation.updatedAt,
    };
  });
}

function appendTask(current: TaskRow[], task: TaskRow) {
  return [...current, task];
}

export function TaskBoard({
  tasks: initialTasks,
  projectId,
  printRunId = null,
  projectDriveFolderId = null,
  phases,
  assignees,
  projects = [],
  depsByTask = {},
  blockedTaskIds = [],
  currentUserId,
  canManage = false,
}: {
  tasks: TaskRow[];
  projectId: string;
  printRunId?: string | null;
  projectDriveFolderId?: string | null;
  phases: Option[];
  assignees: Option[];
  projects?: Option[];
  depsByTask?: Record<string, string[]>;
  blockedTaskIds?: string[];
  currentUserId: string;
  canManage?: boolean;
}) {
  const router = useRouter();
  const { activeTimer, setActiveTimer } = useActiveTimer();
  const searchParams = useSearchParams();
  const [pending, start] = useTransition();
  // Deep link: /…/tasks?task=<id> (e.g. from a mention notification) opens that
  // task on load. Read once at mount so it works through SSR + hydration.
  const [detailTask, setDetailTask] = useState<TaskRow | null>(() => {
    const id = searchParams.get("task");
    return id ? initialTasks.find((t) => t.id === id) ?? null : null;
  });
  const [taskSource, setTasks] = usePropState(initialTasks);
  const taskCreation = useOptimisticAction({
    state: taskSource,
    update: appendTask,
    getKey: (task: TaskRow) => task.id,
  });
  const tasks = taskCreation.state;
  const [dependencies, setDependencies] = usePropState(depsByTask);
  const [activeId, setActiveId] = useState<string | null>(null);
  const blocked = new Set(blockedTaskIds);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );
  const dndId = printRunId
    ? `task-board-${projectId}-${printRunId}`
    : `task-board-${projectId}`;

  const run = (fn: () => Promise<unknown>, mutation?: TaskMutation) => {
    const previousTask = mutation
      ? tasks.find((task) => task.id === mutation.taskId)
      : undefined;
    const previousIndex = mutation
      ? tasks.findIndex((task) => task.id === mutation.taskId)
      : -1;
    if (mutation) setTasks((current) => applyTaskMutation(current, mutation));
    start(async () => {
      try {
        const result = await fn();
        if (result && typeof result === "object" && "error" in result && result.error) {
          throw new Error(String(result.error));
        }
        router.refresh();
      } catch (error) {
        if (mutation && previousTask) {
          setTasks((current) => {
            const withoutTask = current.filter((task) => task.id !== previousTask.id);
            const next = [...withoutTask];
            next.splice(Math.min(previousIndex, next.length), 0, previousTask);
            return next;
          });
        }
        toast.error(error instanceof Error ? error.message : "Could not save the task change.");
      }
    });
  };

  const moveTo = (taskId: string, status: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === status) return;
    run(() => updateTaskStatus(taskId, status), {
      type: "status",
      taskId,
      status,
      updatedAt: new Date(),
    });
  };

  const startTaskTimer = (task: TaskRow) => {
    const previous = activeTimer;
    setActiveTimer({
      entryId: `pending-${crypto.randomUUID()}`,
      taskId: task.id,
      taskTitle: task.title,
      projectSlug: null,
      startedAt: new Date().toISOString(),
    });
    start(async () => {
      try {
        await startTimer(task.id);
        router.refresh();
      } catch (error) {
        setActiveTimer(previous);
        toast.error(error instanceof Error ? error.message : "Could not start the timer.");
      }
    });
  };

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    if (!e.over) return;
    moveTo(String(e.active.id), String(e.over.id));
  };

  const columns = TASK_STATUS_ORDER.map((status) => ({
    status,
    label: TASK_STATUS[status].label,
    items: tasks
      .filter((t) => t.status === status)
      .sort(compareTaskBoardDueDate),
    staleReviewCount: tasks.filter((t) => {
      const age = reviewAgeDays(t.status, t.updatedAt);
      return status === "review" && age !== null && age >= REVIEW_SLA_DAYS;
    }).length,
  }));

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          {tasks.length} task{tasks.length === 1 ? "" : "s"}
          <HelpTip title="Task board" side="bottom" align="start">
            Drag a card anywhere to move it between columns, or use the ⋯ menu.
            Changes save automatically.
          </HelpTip>
        </p>
        <CreateTaskDialog
          projectId={projectId}
          printRunId={printRunId}
          projectDriveFolderId={projectDriveFolderId}
          phases={phases}
          assignees={assignees}
          onOptimisticCreate={(request) => {
            taskCreation.run(
              request.task,
              async () => {
                const result = await request.save();
                if (!result.error && !result.id) {
                  throw new Error("The task was saved without an ID.");
                }
                return result;
              },
              {
                errorMessage: "Could not create the task.",
                reconcile: (result, current) =>
                  current.map((task) =>
                    task.id === request.task.id
                      ? { ...task, id: result.id as string }
                      : task
                  ),
                onSuccess: (result, reconciled) => {
                  setTasks(reconciled);
                  request.onSuccess(result);
                  router.refresh();
                },
                onError: request.onError,
              }
            );
          }}
        />
      </div>

      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
          aria-busy={pending || taskCreation.pending}
        >
          {columns.map((col) => (
            <Column
              key={col.status}
              status={col.status}
              label={col.label}
              count={col.items.length}
              staleReviewCount={col.staleReviewCount}
            >
              {col.items.map((t) => (
                <DraggableCard
                  key={t.id}
                  id={t.id}
                  dragging={t.id === activeId}
                  disabled={
                    Boolean(t.approvalAssignmentId) ||
                    taskCreation.isPending(t.id)
                  }
                  saving={taskCreation.isPending(t.id)}
                >
                  <CardBody
                    task={t}
                    blocked={blocked.has(t.id)}
                    saving={taskCreation.isPending(t.id)}
                    onOpen={
                      taskCreation.isPending(t.id)
                        ? undefined
                        : () => setDetailTask(t)
                    }
                    onTitle={
                      taskCreation.isPending(t.id)
                        ? undefined
                        : (title) =>
                            run(
                              async () => {
                                await updateTaskFields(t.id, { title });
                                offerToLearnTerms(t.title, title);
                              },
                              {
                                type: "patch",
                                taskId: t.id,
                                fields: { title },
                              }
                            )
                    }
                    menu={
                      taskCreation.isPending(t.id) ? undefined : (
                        <TaskMenu
                          task={t}
                          assignees={assignees}
                          allTasks={tasks}
                          dependsOn={dependencies[t.id] ?? []}
                          onOpen={() => setDetailTask(t)}
                          onStatus={(s) => moveTo(t.id, s)}
                          onAssign={(u) =>
                            run(() => assignTask(t.id, u), {
                              type: "patch",
                              taskId: t.id,
                              fields: {
                                assignedTo: u,
                                assigneeName:
                                  assignees.find((item) => item.id === u)
                                    ?.name ?? null,
                              },
                            })
                          }
                          onStartTimer={() => startTaskTimer(t)}
                          onToggleDep={(depId, checked) => {
                            const previous = dependencies[t.id] ?? [];
                            const cur = dependencies[t.id] ?? [];
                            const next = checked
                              ? [...cur, depId]
                              : cur.filter((x) => x !== depId);
                            setDependencies((current) => ({
                              ...current,
                              [t.id]: next,
                            }));
                            start(async () => {
                              try {
                                await setTaskDependencies(t.id, next);
                                router.refresh();
                              } catch (error) {
                                setDependencies((current) => ({
                                  ...current,
                                  [t.id]: previous,
                                }));
                                toast.error(
                                  error instanceof Error
                                    ? error.message
                                    : "Could not update task dependencies."
                                );
                              }
                            });
                          }}
                          onDelete={() =>
                            run(() => deleteTask(t.id), {
                              type: "delete",
                              taskId: t.id,
                            })
                          }
                        />
                      )
                    }
                  />
                </DraggableCard>
              ))}
              {col.items.length === 0 ? (
                <p className="px-1 py-3 text-center text-xs text-muted-foreground">
                  Drop tasks here
                </p>
              ) : null}
            </Column>
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeTask ? (
            <div className="rotate-2 cursor-grabbing rounded-md border bg-card p-3 shadow-lg">
              <CardBody task={activeTask} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <TaskDetailDialog
        task={detailTask ? tasks.find((task) => task.id === detailTask.id) ?? detailTask : null}
        assignees={assignees}
        projects={projects}
        currentUserId={currentUserId}
        canManage={canManage}
        onOptimisticUpdate={(fields) => {
          if (!detailTask) return undefined;
          const previous = tasks.find((task) => task.id === detailTask.id);
          setTasks((current) =>
            applyTaskMutation(current, {
              type: "patch",
              taskId: detailTask.id,
              fields,
            })
          );
          return () => {
            if (!previous) return;
            setTasks((current) =>
              current.map((task) => (task.id === previous.id ? previous : task))
            );
          };
        }}
        onOptimisticDelete={() => {
          if (!detailTask) return undefined;
          const previous = tasks.find((task) => task.id === detailTask.id);
          const previousIndex = tasks.findIndex((task) => task.id === detailTask.id);
          setTasks((current) =>
            applyTaskMutation(current, { type: "delete", taskId: detailTask.id })
          );
          return () => {
            if (!previous) return;
            setTasks((current) => {
              const next = current.filter((task) => task.id !== previous.id);
              next.splice(Math.min(previousIndex, next.length), 0, previous);
              return next;
            });
          };
        }}
        onClose={() => {
          setDetailTask(null);
          // Drop ?task= so a refresh/back doesn't reopen it (no server round-trip).
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

function Column({
  status,
  label,
  count,
  staleReviewCount,
  children,
}: {
  status: string;
  label: string;
  count: number;
  staleReviewCount: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const limit = TASK_WIP_LIMITS[status];
  const overLimit = limit !== undefined && count > limit;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          {label}
          {overLimit ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning/20 px-1.5 py-0.5 text-[10px] font-medium text-warning-foreground">
              <AlertTriangle className="size-3" />
              WIP
            </span>
          ) : null}
          {staleReviewCount > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
              <Clock3 className="size-3" />
              {staleReviewCount} stale
            </span>
          ) : null}
        </span>
        <span
          className={cn(
            "text-xs tabular-nums text-muted-foreground",
            overLimit && "font-medium text-warning"
          )}
          title={limit ? `Recommended limit: ${limit}` : undefined}
        >
          {count}
          {limit ? `/${limit}` : ""}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-24 flex-col gap-2 rounded-lg bg-muted/40 p-2 transition-colors",
          isOver && "bg-muted ring-2 ring-ring/40"
        )}
      >
        {children}
      </div>
    </div>
  );
}

function DraggableCard({
  id,
  dragging,
  disabled = false,
  saving = false,
  children,
}: {
  id: string;
  dragging: boolean;
  disabled?: boolean;
  saving?: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id, disabled });
  return (
    // The whole card is the drag surface (grab it anywhere). The 6px activation
    // distance keeps clicks on the ⋯ menu working. The grip stays as a visual
    // affordance and, being `touch-none`, is the reliable drag handle on touch
    // while the rest of the card still scrolls the page.
    <div
      ref={setNodeRef}
      className={cn(
        "group/card select-none rounded-md border bg-card p-3 shadow-xs transition-shadow hover:shadow-sm",
        saving &&
          "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1",
        disabled ? "cursor-default" : "cursor-grab active:cursor-grabbing",
        dragging && "opacity-40"
      )}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-start gap-1.5">
        <span
          aria-hidden
          className="-ml-1 mt-0.5 flex size-8 shrink-0 touch-none items-center justify-center rounded text-muted-foreground/50 transition-colors group-hover/card:text-muted-foreground"
        >
          <GripVertical className="size-4" />
        </span>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

function CardBody({
  task: t,
  menu,
  blocked = false,
  saving = false,
  onOpen,
  onTitle,
}: {
  task: TaskRow;
  menu?: React.ReactNode;
  blocked?: boolean;
  saving?: boolean;
  /** Open the task detail dialog (title click). */
  onOpen?: () => void;
  onTitle?: (title: string) => void;
}) {
  const due = dueLabel(t.dueDate);
  const age = reviewAgeDays(t.status, t.updatedAt);
  const staleReview = age !== null && age >= REVIEW_SLA_DAYS;
  const [editing, setEditing] = useState(false);
  const [titleValue, setTitleValue] = useState(t.title);

  function saveTitle() {
    setEditing(false);
    const v = titleValue.trim();
    if (!v || v === t.title) {
      setTitleValue(t.title);
      return;
    }
    onTitle?.(v);
  }

  return (
    <>
      <div className="flex items-start justify-between gap-1">
        {editing ? (
          <input
            autoFocus
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            // Keep pointer events off the draggable card so typing/selecting works.
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              // The card's KeyboardSensor also uses Space/Enter. Keep editing
              // keystrokes in the input so they cannot start a keyboard drag.
              e.stopPropagation();
              if (e.key === "Enter") {
                e.preventDefault();
                saveTitle();
              } else if (e.key === "Escape") {
                setTitleValue(t.title);
                setEditing(false);
              }
            }}
            onBlur={saveTitle}
            className="min-w-0 flex-1 rounded border border-input bg-background px-1.5 py-0.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        ) : onOpen ? (
          <button
            type="button"
            onClick={onOpen}
            // Drag still works from here (via the parent card); a plain click opens details.
            className="min-w-0 flex-1 cursor-pointer text-left text-sm font-medium leading-snug text-pretty hover:underline"
          >
            {t.isMilestone ? (
              <Flag className="mr-1 inline size-3.5 text-warning" />
            ) : null}
            {t.title}
          </button>
        ) : (
          <p className="min-w-0 flex-1 text-sm font-medium leading-snug text-pretty">
            {t.isMilestone ? (
              <Flag className="mr-1 inline size-3.5 text-warning" />
            ) : null}
            {t.title}
          </p>
        )}
        <div className="flex shrink-0 items-center">
          {onOpen && !editing && !t.approvalAssignmentId ? (
            <button
              type="button"
              aria-label="Edit title"
              title="Edit title"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                setTitleValue(t.title);
                setEditing(true);
              }}
              className="flex size-6 items-center justify-center rounded text-muted-foreground/50 opacity-0 transition-opacity hover:text-muted-foreground focus-visible:opacity-100 group-hover/card:opacity-100"
            >
              <Pencil className="size-3.5" />
            </button>
          ) : null}
          {menu}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {saving ? <Badge variant="secondary">Saving…</Badge> : null}
        <PriorityBadge priority={t.priority} />
        {t.sourceRecurringTaskId ? (
          <Badge className="bg-info text-info-foreground">
            <Repeat2 className="size-3" /> Recurring
          </Badge>
        ) : null}
        {t.printPaymentId ? (
          <Badge className="bg-warning text-warning-foreground">
            Printer payment
          </Badge>
        ) : null}
        {t.approvalAssignmentId ? (
          <Badge className="bg-primary text-primary-foreground">
            <ShieldCheck className="size-3" /> Budget approval
          </Badge>
        ) : null}
        {blocked ? (
          <Badge className="bg-warning text-warning-foreground">
            <Lock className="size-3" /> Blocked
          </Badge>
        ) : null}
        {t.printRunId ? (
          <Badge variant="outline" className="border-info/30 bg-info/10 text-info">
            {t.printRunKind === "reprint"
              ? t.printNumber
                ? `Reprint ${t.printNumber}`
                : "Reprint"
              : "Print run"}
          </Badge>
        ) : null}
        {t.unitName ? <Badge variant="secondary">{t.unitName}</Badge> : null}
        {t.dueDate && t.status !== "done" ? (
          <span
            className={cn(
              "text-xs tabular-nums",
              due.tone === "overdue" && "font-medium text-destructive",
              due.tone === "soon" && "text-warning",
              due.tone === "normal" && "text-muted-foreground"
            )}
          >
            {due.text}
          </span>
        ) : null}
        {age !== null ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs tabular-nums",
              staleReview
                ? "font-medium text-destructive"
                : "text-muted-foreground"
            )}
          >
            <Clock3 className="size-3" />
            Review {age}d
          </span>
        ) : null}
        {t.driveFolderName ? (
          <span
            className="inline-flex max-w-[9rem] items-center gap-1 rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 text-xs text-muted-foreground"
            title={`Working folder: ${t.driveFolderName}`}
          >
            <Folder className="size-3 shrink-0" />
            <span className="truncate">{t.driveFolderName}</span>
          </span>
        ) : null}
      </div>
      <TaskAttachmentShortcut task={t} />
      <p className="mt-2 text-xs text-muted-foreground">
        {t.assigneeName ?? "Unassigned"}
      </p>
    </>
  );
}

function TaskMenu({
  task,
  assignees,
  allTasks,
  dependsOn,
  onOpen,
  onStatus,
  onAssign,
  onStartTimer,
  onToggleDep,
  onDelete,
}: {
  task: TaskRow;
  assignees: Option[];
  allTasks: TaskRow[];
  dependsOn: string[];
  onOpen: () => void;
  onStatus: (status: string) => void;
  onAssign: (userId: string | null) => void;
  onStartTimer: () => void;
  onToggleDep: (depId: string, checked: boolean) => void;
  onDelete: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const depSet = new Set(dependsOn);
  const others = allTasks.filter((t) => t.id !== task.id);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Task actions"
              className="-mr-1 -mt-1 cursor-pointer"
              // Whole card is a drag surface — keep pointer events on the menu
              // from starting a drag so it opens reliably.
              onPointerDown={(e) => e.stopPropagation()}
            />
          }
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={onOpen}>View details</DropdownMenuItem>
          {!task.approvalAssignmentId ? (
            <>
              <DropdownMenuItem onClick={onStartTimer}>
                <Play className="size-4" /> Start timer
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Move to</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {TASK_STATUS_ORDER.map((s) => (
                    <DropdownMenuItem
                      key={s}
                      disabled={s === task.status}
                      onClick={() => onStatus(s)}
                    >
                      {TASK_STATUS[s].label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Assign to</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onClick={() => onAssign(null)}>
                    Unassigned
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {assignees.map((a) => (
                    <DropdownMenuItem key={a.id} onClick={() => onAssign(a.id)}>
                      {a.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Blocked by</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-72 w-56 overflow-y-auto">
                  {others.length === 0 ? (
                    <DropdownMenuItem disabled>No other tasks</DropdownMenuItem>
                  ) : (
                    others.map((o) => (
                      <DropdownMenuCheckboxItem
                        key={o.id}
                        checked={depSet.has(o.id)}
                        onCheckedChange={(checked) => onToggleDep(o.id, checked)}
                        closeOnClick={false}
                      >
                        <span className="truncate">{o.title}</span>
                      </DropdownMenuCheckboxItem>
                    ))
                  )}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setConfirmOpen(true)}
              >
                Delete
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete task?</DialogTitle>
            <DialogDescription>
              Delete &quot;{task.title}&quot;? This removes it from the project
              board and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Keep task
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmOpen(false);
                onDelete();
              }}
            >
              Delete task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
