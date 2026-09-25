"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Columns3,
  Flag,
  Focus,
  ListChecks,
  Play,
  ShieldCheck,
  Square,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";

import type { AgendaItem } from "@/lib/agenda/bucket";
import { bucketAgenda } from "@/lib/agenda/bucket";
import type { MyWorkTaskRow } from "@/lib/tasks/queries";
import type { ActiveTimer } from "@/lib/tasks/time-queries";
import { splitTasksByAttention } from "@/lib/tasks/attention";
import {
  isCompletedOn,
  matchesAgendaFilter,
  type AgendaFilter,
  type MyWorkView,
} from "@/lib/tasks/my-work";
import { updateTaskStatus } from "@/lib/tasks/actions";
import { startTimer, stopTimer } from "@/lib/tasks/time-actions";
import { AgendaRow } from "@/components/agenda/agenda-view";
import { PriorityBadge, TASK_STATUS, TASK_STATUS_ORDER } from "@/components/badges";
import { CreateTaskDialog } from "@/components/tasks/create-task-dialog";
import { PersonalTaskBoard } from "@/components/tasks/personal-task-board";
import { TaskCompleteButton } from "@/components/tasks/task-complete-button";
import { TaskDetailDialog } from "@/components/tasks/task-detail-dialog";
import { TaskAttachmentShortcut } from "@/components/tasks/task-attachment-shortcut";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { dueLabel } from "@/lib/format";
import { elapsedSeconds, formatClock, formatDuration } from "@/lib/time";
import { cn } from "@/lib/utils";
import { usePropState } from "@/hooks/use-prop-state";
import { useActiveTimer } from "@/components/time/active-timer-provider";
import { EmailTaskSuggestions } from "@/components/tasks/email-task-suggestions";
import type { EmailTaskSuggestionRow } from "@/lib/email/task-suggestions";
import { EmailTaskLearningRules } from "@/components/tasks/email-task-learning-rules";
import type { EmailTaskRuleRow } from "@/lib/email/task-rule-queries";
import type { ExternalFollowUp } from "@/lib/email/follow-ups";
import { ExternalFollowUpCard } from "@/components/correspondence/external-follow-up-card";

// House ease + spring for list reflow when a completed row leaves.
const EASE = [0.22, 1, 0.36, 1] as const;
const ROW_SPRING = { type: "spring", stiffness: 380, damping: 32 } as const;

type Status = (typeof TASK_STATUS_ORDER)[number];
type Option = { id: string; name: string };

type TaskMutation =
  | { type: "status"; taskId: string; status: Status; completedAt: Date | null }
  | { type: "patch"; taskId: string; fields: Partial<MyWorkTaskRow> }
  | { type: "delete"; taskId: string };

function applyTaskMutation(current: MyWorkTaskRow[], mutation: TaskMutation) {
  if (mutation.type === "delete") {
    return current.filter((task) => task.id !== mutation.taskId);
  }
  return current.map((task) => {
    if (task.id !== mutation.taskId) return task;
    if (mutation.type === "patch") return { ...task, ...mutation.fields };
    return {
      ...task,
      status: mutation.status,
      completedAt: mutation.completedAt,
      updatedAt: new Date(),
    };
  });
}

const VIEW_META: Array<{
  value: MyWorkView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { value: "focus", label: "Focus", icon: Focus },
  { value: "board", label: "Board", icon: Columns3 },
  { value: "agenda", label: "Agenda", icon: CalendarDays },
];

export function MyWorkHub({
  initialTasks,
  agendaItems,
  todayIso,
  timeZone,
  trackedTodaySeconds,
  autoStartTimer,
  assignees,
  projects,
  currentUserId,
  canManage,
  blockedByTaskId,
  initialView,
  initialTaskId,
  initialEmailSuggestions,
  initialEmailSuggestionId,
  initialEmailTaskRules,
  initialExternalFollowUps,
}: {
  initialTasks: MyWorkTaskRow[];
  agendaItems: AgendaItem[];
  todayIso: string;
  timeZone: string;
  trackedTodaySeconds: number;
  initialActiveTimer: ActiveTimer | null;
  autoStartTimer: boolean;
  assignees: Option[];
  projects: Option[];
  currentUserId: string;
  canManage: boolean;
  blockedByTaskId: Record<string, string>;
  initialView: MyWorkView;
  initialTaskId: string | null;
  initialEmailSuggestions: EmailTaskSuggestionRow[];
  initialEmailSuggestionId: string | null;
  initialEmailTaskRules: EmailTaskRuleRow[];
  initialExternalFollowUps: ExternalFollowUp[];
}) {
  const router = useRouter();
  const [view, setView] = useState<MyWorkView>(initialView);
  const [detailTask, setDetailTask] = useState<MyWorkTaskRow | null>(() =>
    initialTaskId
      ? initialTasks.find((task) => task.id === initialTaskId) ?? null
      : null
  );
  const { activeTimer, setActiveTimer } = useActiveTimer();
  const [pending, startTransition] = useTransition();
  const [tasks, setTasks] = usePropState(initialTasks);

  useEffect(() => {
    const syncFromHistory = () => {
      const next = new URL(window.location.href).searchParams.get("view");
      if (next === "board" || next === "agenda" || next === "focus") {
        setView(next);
      } else {
        setView("focus");
      }
    };
    window.addEventListener("popstate", syncFromHistory);
    return () => window.removeEventListener("popstate", syncFromHistory);
  }, []);

  const changeView = (next: MyWorkView) => {
    setView(next);
    const url = new URL(window.location.href);
    if (next === "focus") url.searchParams.delete("view");
    else url.searchParams.set("view", next);
    window.history.pushState(null, "", url);
  };

  const moveTask = (task: MyWorkTaskRow, status: Status) => {
    if (task.status === status) return;
    const previousTimer = activeTimer;
    const previousTask = task;
    const completing = status === "done";
    if (status === "in_progress" && autoStartTimer) {
      setActiveTimer({
        entryId: `pending-${crypto.randomUUID()}`,
        taskId: task.id,
        taskTitle: task.title,
        projectSlug: task.projectSlug,
        startedAt: new Date().toISOString(),
      });
    } else if (activeTimer?.taskId === task.id && status !== "in_progress") {
      setActiveTimer(null);
    }
    setTasks((current) =>
      applyTaskMutation(current, {
        type: "status",
        taskId: task.id,
        status,
        completedAt: completing ? new Date() : null,
      })
    );
    startTransition(async () => {
      try {
        await updateTaskStatus(task.id, status);
        router.refresh();
        if (completing) toast.success("Task completed");
      } catch (error) {
        setTasks((current) =>
          current.map((item) => (item.id === previousTask.id ? previousTask : item))
        );
        setActiveTimer(previousTimer);
        toast.error(error instanceof Error ? error.message : "Could not move the task.");
      }
    });
  };

  const toggleTimer = (task: MyWorkTaskRow) => {
    const previous = activeTimer;
    const isRunning = activeTimer?.taskId === task.id;
    setActiveTimer(
      isRunning
        ? null
        : {
            entryId: `pending-${crypto.randomUUID()}`,
            taskId: task.id,
            taskTitle: task.title,
            projectSlug: task.projectSlug,
            startedAt: new Date().toISOString(),
          }
    );
    startTransition(async () => {
      try {
        if (isRunning) await stopTimer();
        else await startTimer(task.id);
        router.refresh();
      } catch (error) {
        setActiveTimer(previous);
        toast.error(error instanceof Error ? error.message : "Could not update the timer.");
      }
    });
  };

  const openTasks = tasks.filter((task) => task.status !== "done");
  const completedToday = tasks.filter(
    (task) =>
      task.status === "done" &&
      isCompletedOn(task.completedAt, todayIso, timeZone)
  );
  const activeCount = openTasks.filter(
    (task) => task.status === "in_progress" || task.status === "review"
  ).length;

  return (
    <div className="space-y-5">
      <EmailTaskSuggestions
        initialSuggestions={initialEmailSuggestions}
        assignees={assignees}
        projects={projects}
        currentUserId={currentUserId}
        canManage={canManage}
        highlightedId={initialEmailSuggestionId}
        showCorrespondenceLink={canManage}
      />
      <EmailTaskLearningRules rules={initialEmailTaskRules} />

      {initialExternalFollowUps.length > 0 ? (
        <section className="space-y-3" aria-labelledby="external-follow-ups-heading">
          <div>
            <h2 id="external-follow-ups-heading" className="text-sm font-medium">
              External follow-ups
            </h2>
            <p className="text-xs text-muted-foreground">
              Project email that has not received a response by its follow-up date.
            </p>
          </div>
          {initialExternalFollowUps.map((followUp) => (
            <ExternalFollowUpCard key={followUp.id} followUp={followUp} showProject />
          ))}
        </section>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav
          aria-label="My Work views"
          className="grid grid-cols-3 rounded-lg bg-muted p-1 sm:inline-grid sm:w-auto"
        >
          {VIEW_META.map((item) => {
            const Icon = item.icon;
            const active = view === item.value;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => changeView(item.value)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-[background-color,color,box-shadow]",
                  active
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </button>
            );
          })}
        </nav>
        <CreateTaskDialog
          assignees={assignees}
          projects={projects}
          defaultAssignee={currentUserId}
          triggerLabel="Create task"
        />
      </div>

      {view === "focus" ? (
        <FocusView
          tasks={tasks}
          todayIso={todayIso}
          completedToday={completedToday}
          trackedTodaySeconds={trackedTodaySeconds}
          activeTimer={activeTimer}
          pending={pending}
          onOpen={setDetailTask}
          onStatus={moveTask}
          onTimer={toggleTimer}
        />
      ) : null}

      {view === "board" ? (
        <PersonalTaskBoard
          tasks={tasks}
          projects={projects}
          blockedByTaskId={blockedByTaskId}
          activeTimerTaskId={activeTimer?.taskId ?? null}
          pending={pending}
          onOpen={setDetailTask}
          onStatus={moveTask}
          onTimer={toggleTimer}
        />
      ) : null}

      {view === "agenda" ? (
        <AgendaView items={agendaItems} todayIso={todayIso} />
      ) : null}

      <TaskDetailDialog
        task={
          detailTask
            ? tasks.find((task) => task.id === detailTask.id) ?? detailTask
            : null
        }
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
          const url = new URL(window.location.href);
          url.searchParams.delete("task");
          window.history.replaceState(null, "", url);
        }}
      />

      <span className="sr-only" aria-live="polite">
        {pending ? "Saving task changes" : `${openTasks.length} open tasks, ${activeCount} active`}
      </span>
    </div>
  );
}

function FocusView({
  tasks,
  todayIso,
  completedToday,
  trackedTodaySeconds,
  activeTimer,
  pending,
  onOpen,
  onStatus,
  onTimer,
}: {
  tasks: MyWorkTaskRow[];
  todayIso: string;
  completedToday: MyWorkTaskRow[];
  trackedTodaySeconds: number;
  activeTimer: ActiveTimer | null;
  pending: boolean;
  onOpen: (task: MyWorkTaskRow) => void;
  onStatus: (task: MyWorkTaskRow, status: Status) => void;
  onTimer: (task: MyWorkTaskRow) => void;
}) {
  const [showLater, setShowLater] = useState(false);
  const [showCompleted, setShowCompleted] = useState(true);
  const runningSeconds = useLiveElapsed(activeTimer?.startedAt ?? null);
  const open = tasks.filter((task) => task.status !== "done");
  const working = open.filter(
    (task) => task.status === "in_progress" || task.status === "review"
  );
  const notStarted = open.filter(
    (task) => task.status !== "in_progress" && task.status !== "review"
  );
  const { attention, later } = splitTasksByAttention(notStarted, todayIso);

  return (
    <div className="space-y-5">
      <div className="grid overflow-hidden rounded-xl border bg-card sm:grid-cols-3">
        <FocusStat label="Open" value={open.length} icon={ListChecks} />
        <FocusStat label="Completed today" value={completedToday.length} icon={CheckCircle2} />
        <FocusStat label="Tracked today" value={formatDuration(trackedTodaySeconds)} icon={Clock3} />
      </div>

      {activeTimer ? (
        <div className="flex flex-col gap-3 rounded-xl border border-success/30 bg-success/8 px-4 py-3 sm:flex-row sm:items-center">
          <span className="relative flex size-3 shrink-0" aria-hidden>
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
            <span className="relative inline-flex size-3 rounded-full bg-success" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-success">Working now</p>
            <p className="truncate text-sm font-semibold">{activeTimer.taskTitle}</p>
          </div>
          <span className="self-start rounded-full bg-background/70 px-2.5 py-1 font-mono text-sm font-semibold tabular-nums sm:self-auto">
            {formatClock(runningSeconds)}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const task = tasks.find((item) => item.id === activeTimer.taskId);
              if (task) onTimer(task);
            }}
          >
            <Square className="size-3.5 fill-current" /> Stop timer
          </Button>
        </div>
      ) : null}

      {working.length > 0 ? (
        <FocusSection
          title="Working now"
          description="In progress and waiting for review"
          tasks={working}
          pending={pending}
          activeTimerTaskId={activeTimer?.taskId ?? null}
          onOpen={onOpen}
          onStatus={onStatus}
          onTimer={onTimer}
        />
      ) : null}

      <FocusSection
        title="Needs attention"
        description="Overdue, due soon, high priority, and undated work"
        tasks={attention}
        pending={pending}
        activeTimerTaskId={activeTimer?.taskId ?? null}
        onOpen={onOpen}
        onStatus={onStatus}
        onTimer={onTimer}
        emptyTitle="Nothing needs attention right now"
      />

      {later.length > 0 ? (
        <CollapsibleSection
          title={`Later · ${later.length}`}
          description="Farther-future work kept out of your active queue"
          open={showLater}
          onToggle={() => setShowLater((value) => !value)}
        >
          <FocusTaskList
            tasks={later}
            pending={pending}
            activeTimerTaskId={activeTimer?.taskId ?? null}
            onOpen={onOpen}
            onStatus={onStatus}
            onTimer={onTimer}
          />
        </CollapsibleSection>
      ) : null}

      {completedToday.length > 0 ? (
        <CollapsibleSection
          title={`Completed today · ${completedToday.length}`}
          description="A quick record of today's progress"
          open={showCompleted}
          onToggle={() => setShowCompleted((value) => !value)}
          tone="success"
        >
          <FocusTaskList
            tasks={completedToday}
            pending={pending}
            activeTimerTaskId={activeTimer?.taskId ?? null}
            onOpen={onOpen}
            onStatus={onStatus}
            onTimer={onTimer}
          />
        </CollapsibleSection>
      ) : null}
    </div>
  );
}

function FocusStat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-heading text-xl font-semibold tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function FocusSection({
  title,
  description,
  tasks,
  pending,
  activeTimerTaskId,
  onOpen,
  onStatus,
  onTimer,
  emptyTitle,
}: {
  title: string;
  description: string;
  tasks: MyWorkTaskRow[];
  pending: boolean;
  activeTimerTaskId: string | null;
  onOpen: (task: MyWorkTaskRow) => void;
  onStatus: (task: MyWorkTaskRow, status: Status) => void;
  onTimer: (task: MyWorkTaskRow) => void;
  emptyTitle?: string;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">{tasks.length}</span>
      </div>
      {tasks.length > 0 ? (
        <FocusTaskList
          tasks={tasks}
          pending={pending}
          activeTimerTaskId={activeTimerTaskId}
          onOpen={onOpen}
          onStatus={onStatus}
          onTimer={onTimer}
        />
      ) : (
        <div className="rounded-xl border bg-card py-10 text-center text-sm text-muted-foreground">
          <Check className="mx-auto mb-2 size-5 text-success" />
          {emptyTitle ?? "Nothing here"}
        </div>
      )}
    </section>
  );
}

function FocusTaskList({
  tasks,
  pending,
  activeTimerTaskId,
  onOpen,
  onStatus,
  onTimer,
}: {
  tasks: MyWorkTaskRow[];
  pending: boolean;
  activeTimerTaskId: string | null;
  onOpen: (task: MyWorkTaskRow) => void;
  onStatus: (task: MyWorkTaskRow, status: Status) => void;
  onTimer: (task: MyWorkTaskRow) => void;
}) {
  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card" aria-busy={pending}>
      <AnimatePresence initial={false}>
        {tasks.map((task) => {
        const due = dueLabel(task.dueDate);
        const done = task.status === "done";
        const timerRunning = activeTimerTaskId === task.id;
        return (
          <motion.li
            key={task.id}
            layout
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.32, delay: 0.18, ease: EASE } }}
            transition={{ duration: 0.28, ease: EASE, layout: ROW_SPRING }}
            className="flex items-start gap-2 px-3 py-3 sm:items-center sm:gap-3"
          >
            {task.approvalAssignmentId ? (
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ShieldCheck className="size-5" />
              </span>
            ) : (
              <TaskCompleteButton
                done={done}
                onToggle={() => onStatus(task, done ? "todo" : "done")}
                title={task.title}
                className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-success/10 hover:text-success focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              />
            )}
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => onOpen(task)}
                className={cn(
                  "line-clamp-2 text-left text-sm font-semibold hover:underline sm:block sm:truncate",
                  done && "text-muted-foreground line-through"
                )}
              >
                {task.isMilestone ? <Flag className="mr-1 inline size-3.5 text-warning" /> : null}
                {task.title}
              </button>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                {task.projectSlug ? (
                  <Link href={`/projects/${task.projectSlug}/tasks`} className="truncate hover:underline">
                    {task.projectTitle}
                  </Link>
                ) : (
                  <span>No project</span>
                )}
                {task.trackedSeconds > 0 ? (
                  <span className="flex items-center gap-1">
                    <Clock3 className="size-3" /> {formatDuration(task.trackedSeconds)}
                  </span>
                ) : null}
              </div>
              <TaskAttachmentShortcut task={task} />
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
              <div className="hidden items-center gap-2 lg:flex">
                <span
                  className={cn(
                    "text-xs",
                    due.tone === "overdue" && "font-medium text-destructive",
                    due.tone === "soon" && "text-warning-foreground",
                    (due.tone === "normal" || due.tone === "none") && "text-muted-foreground"
                  )}
                >
                  {due.text}
                </span>
                <PriorityBadge priority={task.priority} />
              </div>
              {!done ? (
                <Button
                  type="button"
                  size="icon-xs"
                  variant={timerRunning ? "destructive" : "ghost"}
                  onClick={() => onTimer(task)}
                  aria-label={timerRunning ? `Stop timer for ${task.title}` : `Start timer for ${task.title}`}
                  title={timerRunning ? "Stop timer" : "Start timer"}
                >
                  {timerRunning ? <Square className="size-3.5 fill-current" /> : <Play className="size-3.5" />}
                </Button>
              ) : null}
              <Select
                value={task.status}
                disabled={Boolean(task.approvalAssignmentId)}
                itemToStringLabel={(status) => TASK_STATUS[status].label}
                onValueChange={(value) => value && onStatus(task, value as Status)}
              >
                <SelectTrigger size="sm" aria-label={`Status for ${task.title}`} className="max-w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_STATUS_ORDER.map((status) => (
                    <SelectItem key={status} value={status}>
                      {TASK_STATUS[status].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </motion.li>
        );
        })}
      </AnimatePresence>
    </ul>
  );
}

function useLiveElapsed(startedAt: string | null) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const id = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);
  return startedAt ? elapsedSeconds(startedAt, new Date()) : 0;
}

function CollapsibleSection({
  title,
  description,
  open,
  onToggle,
  children,
  tone,
}: {
  title: string;
  description: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  tone?: "success";
}) {
  return (
    <section className="space-y-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border bg-card px-4 py-2.5 text-left hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <span className="min-w-0">
          <span className={cn("block text-sm font-semibold", tone === "success" && "text-success")}>{title}</span>
          <span className="block truncate text-xs text-muted-foreground">{description}</span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open ? children : null}
    </section>
  );
}

function AgendaView({ items, todayIso }: { items: AgendaItem[]; todayIso: string }) {
  const [filter, setFilter] = useState<AgendaFilter>("all");
  const filtered = items.filter((item) => matchesAgendaFilter(item.kind, filter));
  const buckets = bucketAgenda(filtered, todayIso);
  const sections: Array<{
    key: keyof typeof buckets;
    label: string;
    destructive?: boolean;
  }> = [
    { key: "overdue", label: "Overdue", destructive: true },
    { key: "thisWeek", label: "This week" },
    { key: "next2Weeks", label: "Next two weeks" },
    { key: "later", label: "Later" },
  ];
  const filters: Array<{ value: AgendaFilter; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { value: "all", label: "All", icon: CalendarDays },
    { value: "tasks", label: "My tasks", icon: ListChecks },
    { value: "deadlines", label: "Deadlines", icon: Flag },
    { value: "rights", label: "Rights", icon: ShieldCheck },
    { value: "finance", label: "Finance", icon: CircleDollarSign },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Tasks and operational obligations ordered by deadline.
        </p>
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1" aria-label="Agenda filters">
          {filters.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => setFilter(item.value)}
                aria-pressed={filter === item.value}
                className={cn(
                  "flex min-h-9 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium",
                  filter === item.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="size-3.5" /> {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border bg-card py-14 text-center">
          <CalendarDays className="mx-auto mb-2 size-6 text-muted-foreground" />
          <p className="font-medium">Nothing in this agenda view</p>
          <p className="text-sm text-muted-foreground">Try another filter or enjoy the clear schedule.</p>
        </div>
      ) : (
        sections.map((section) => {
          const rows = buckets[section.key];
          if (rows.length === 0) return null;
          return (
            <section key={section.key} className="space-y-2">
              <div className="flex items-baseline justify-between">
                <h2 className={cn("font-heading text-lg font-semibold", section.destructive && "text-destructive")}>{section.label}</h2>
                <span className="text-xs tabular-nums text-muted-foreground">{rows.length}</span>
              </div>
              <ul className="divide-y overflow-hidden rounded-xl border bg-card">
                {rows.map((item) => (
                  <li key={item.id}><AgendaRow item={item} /></li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
