"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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
import { printPaymentFollowUp, selectPersonalWork } from "@/lib/tasks/attention";
import { isSourceControlledTask, taskSourceLink } from "@/lib/tasks/task-source";
import {
  isCompletedOn,
  matchesAgendaFilter,
  type AgendaFilter,
  type MyWorkView,
} from "@/lib/tasks/my-work";
import { updateTaskStatus } from "@/lib/tasks/actions";
import { markPrintPaymentPaid } from "@/lib/print/actions";
import { confirmDialog } from "@/lib/dialog-requests";
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
import { SectionDisclosure } from "@/components/section-disclosure";
import { showTaskCompleted } from "@/lib/tasks/completion-feedback";
import { EmailTaskSuggestions } from "@/components/tasks/email-task-suggestions";
import type { EmailTaskSuggestionRow } from "@/lib/email/task-suggestions";
import { EmailTaskLearningRules } from "@/components/tasks/email-task-learning-rules";
import type { EmailTaskRuleRow } from "@/lib/email/task-rule-queries";
import type { ExternalFollowUp } from "@/lib/email/follow-ups";
import { ExternalFollowUpCard } from "@/components/correspondence/external-follow-up-card";
import {
  TaskSearchField,
  TaskSearchResults,
  useOtherTaskSearch,
} from "@/components/tasks/task-search";
import { useNavigationBadgeAdjustment, useNavigationBadges } from "@/components/navigation-badges-provider";
import { countDueWorkTasks, selectDueWorkTasks } from "@/lib/navigation/badges";
import { MyWorkAttentionSummary } from "@/components/tasks/my-work-attention-summary";

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
      ...(mutation.status === "done" ? { isNextUp: false } : {}),
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
  const [dueOnly, setDueOnly] = useState(false);
  const badgeCounts = useNavigationBadges();
  const [detailTask, setDetailTask] = useState<MyWorkTaskRow | null>(() =>
    initialTaskId
      ? initialTasks.find((task) => task.id === initialTaskId) ?? null
      : null
  );
  const { activeTimer, setActiveTimer } = useActiveTimer();
  const [pending, startTransition] = useTransition();
  const [tasks, setTasks] = usePropState(initialTasks);
  const [searchQuery, setSearchQuery] = useState("");
  const searching = searchQuery.trim().length > 0;
  const otherTasks = useOtherTaskSearch(searchQuery, initialTasks);
  useNavigationBadgeAdjustment("dueTasks",
    countDueWorkTasks(tasks, currentUserId, todayIso, timeZone) -
    countDueWorkTasks(initialTasks, currentUserId, todayIso, timeZone)
  );
  const statusInFlight = useRef(new Set<string>());
  const [previousTaskId, setPreviousTaskId] = useState(initialTaskId);
  if (initialTaskId !== previousTaskId) {
    setPreviousTaskId(initialTaskId);
    if (initialTaskId) setDetailTask(initialTasks.find(task => task.id === initialTaskId) ?? null);
  }


  useEffect(() => {
    const syncFromHistory = () => {
      setDueOnly(false);
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
    setSearchQuery("");
    setDueOnly(false);
    if (next === view) return;
    setView(next);
    const url = new URL(window.location.href);
    if (next === "focus") url.searchParams.delete("view");
    else url.searchParams.set("view", next);
    window.history.pushState(null, "", url);
  };

  const moveTask = (task: MyWorkTaskRow, status: Status) => {
    if (task.id.startsWith("optimistic-task-") || task.status === status || isSourceControlledTask(task) || statusInFlight.current.has(task.id)) return;
    statusInFlight.current.add(task.id);
    const previousTimer = activeTimer;
    const previousTask = task;
    const completing = status === "done";
    const completionToast = completing ? toast.loading("Saving completion and checking the next step…") : undefined;
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
        const result = await updateTaskStatus(task.id, status);
        router.refresh();
        if (completing) showTaskCompleted(result, href => router.push(href), completionToast);
      } catch (error) {
        setTasks((current) =>
          current.map((item) => (item.id === previousTask.id ? previousTask : item))
        );
        setActiveTimer(previousTimer);
        toast.error(error instanceof Error ? error.message : "Could not move the task.", { id: completionToast });
      } finally { statusInFlight.current.delete(task.id); }
    });
  };

  const confirmPrinterPayment = async (task: MyWorkTaskRow) => {
    if (
      !canManage ||
      !task.printPaymentId ||
      task.printPaymentStatus !== "requested" ||
      task.status === "done" ||
      statusInFlight.current.has(task.id)
    ) return;
    const paymentId = task.printPaymentId;
    statusInFlight.current.add(task.id);
    try {
      const confirmed = await confirmDialog(
        `${task.title}${task.projectTitle ? ` (${task.projectTitle})` : ""}. Confirm only after the printer received the money. This marks the payment paid and completes this task.`,
        { title: "Confirm printer paid?", confirmLabel: "Confirm printer paid" }
      );
      if (!confirmed) return;

      const previousTask = task;
      const confirmationToast = toast.loading("Saving payment confirmation…");
      setTasks(current => applyTaskMutation(current, {
        type: "patch",
        taskId: task.id,
        fields: {
          status: "done",
          printPaymentStatus: "paid",
          isNextUp: false,
          completedAt: new Date(),
          updatedAt: new Date(),
        },
      }));
      try {
        await markPrintPaymentPaid(paymentId);
        router.refresh();
        toast.success("Printer payment confirmed.", { id: confirmationToast });
      } catch {
        setTasks(current => current.map(item => item.id === previousTask.id ? previousTask : item));
        toast.error("Couldn't confirm the payment. Check your internet and try again.", { id: confirmationToast });
      }
    } finally {
      statusInFlight.current.delete(task.id);
    }
  };

  const toggleTimer = (task: MyWorkTaskRow) => {
    if (task.id.startsWith("optimistic-task-")) return;
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

  const emailContent = (<>
      {initialExternalFollowUps.length > 0 ? (
        <section id="external-follow-ups" className="scroll-mt-24 space-y-3" aria-labelledby="external-follow-ups-heading">
          <div>
            <h2 id="external-follow-ups-heading" className="text-sm font-medium">
              External follow-ups
            </h2>
            <p className="text-xs text-muted-foreground">
              Project email that has not received a response by its follow-up date.
            </p>
          </div>
          {initialExternalFollowUps.map((followUp) => (
            <ExternalFollowUpCard key={followUp.id} followUp={followUp} showProject syncNavigationBadge />
          ))}
        </section>
      ) : null}
      {initialEmailSuggestions.length > 0 ? (
        <SectionDisclosure id="suggestions" title="Suggestions to review" summary={initialEmailSuggestions.length} description="Personal email task suggestions awaiting your review" defaultOpen={Boolean(initialEmailSuggestionId)} revealFor={initialEmailSuggestionId}>
          <EmailTaskSuggestions
            syncNavigationBadge
            initialSuggestions={initialEmailSuggestions}
            assignees={assignees}
            projects={projects}
            currentUserId={currentUserId}
            canManage={canManage}
            highlightedId={initialEmailSuggestionId}
            showCorrespondenceLink={canManage}
          />
        </SectionDisclosure>
      ) : null}
      {initialEmailTaskRules.some(rule => rule.status === "candidate") ? (
        <SectionDisclosure id="email-preferences" title="Email assistant preferences" summary={initialEmailTaskRules.filter(rule => rule.status === "candidate").length}
          description="Proposed preferences do not add to your menu badge.">
          <EmailTaskLearningRules rules={initialEmailTaskRules.filter(rule => rule.status === "candidate")} />
        </SectionDisclosure>
      ) : null}

  </>);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <nav
          aria-label="My Work views"
          className="grid shrink-0 grid-cols-3 rounded-lg bg-muted p-1 md:inline-grid md:w-auto"
        >
          {VIEW_META.map((item) => {
            const Icon = item.icon;
            const active = view === item.value && !searching;
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
        <div className="flex items-center gap-2 md:flex-1 md:justify-end">
          <TaskSearchField
            value={searchQuery}
            onValueChange={setSearchQuery}
            className="min-w-0 flex-1 md:max-w-sm"
          />
          <CreateTaskDialog
            canManage={canManage}
            assignees={assignees}
            projects={projects}
            defaultAssignee={currentUserId}
            triggerLabel="Create task"
            onOptimisticCreate={({ task, save, onSuccess, onError }) => {
              const mine = task.assignedTo === currentUserId;
              if (mine) setTasks(current => [...current, { ...task, projectSlug: null, projectTitle: projects.find(project => project.id === task.projectId)?.name ?? null, completedAt: null, trackedSeconds: 0 }]);
              startTransition(async () => {
                try {
                  const result = await save();
                  if (result.error) throw new Error(result.error);
                  if (!result.id) throw new Error("The task was saved without an ID.");
                  setTasks(current => current.map(item => item.id === task.id && result.id ? { ...item, id: result.id } : item));
                  onSuccess(result);
                  router.refresh();
                } catch (error) {
                  setTasks(current => current.filter(item => item.id !== task.id));
                  onError(error instanceof Error ? error.message : "Could not create the task.");
                }
              });
            }}
          />
        </div>
      </div>

      {searching ? (
        <TaskSearchResults
          query={searchQuery}
          tasks={tasks}
          other={otherTasks}
          todayIso={todayIso}
          timeZone={timeZone}
          currentUserId={currentUserId}
          onOpen={setDetailTask}
        />
      ) : null}

      {!searching ? <MyWorkAttentionSummary counts={badgeCounts} onShowDueTasks={() => {
        changeView("focus");
        setDueOnly(true);
      }} /> : null}

      {!searching && view === "focus" ? (
        <FocusView
          tasks={tasks}
          currentUserId={currentUserId}
          dueOnly={dueOnly}
          onShowAll={() => setDueOnly(false)}
          emailContent={emailContent}
          hasEmailContent={initialExternalFollowUps.length > 0 || initialEmailSuggestions.length > 0 || initialEmailTaskRules.some(rule => rule.status === "candidate")}
          todayIso={todayIso}
          timeZone={timeZone}
          completedToday={completedToday}
          trackedTodaySeconds={trackedTodaySeconds}
          activeTimer={activeTimer}
          pending={pending}
          onOpen={task => { if (!task.id.startsWith("optimistic-task-")) setDetailTask(task); }}
          onStatus={moveTask}
          onTimer={toggleTimer}
          onConfirmPayment={canManage ? confirmPrinterPayment : undefined}
        />
      ) : null}

      {!searching && view === "board" ? (
        <PersonalTaskBoard
          tasks={tasks}
          projects={projects}
          blockedByTaskId={blockedByTaskId}
          activeTimerTaskId={activeTimer?.taskId ?? null}
          pending={pending}
          onOpen={task => { if (!task.id.startsWith("optimistic-task-")) setDetailTask(task); }}
          onStatus={moveTask}
          onTimer={toggleTimer}
        />
      ) : null}

      {!searching && view === "agenda" ? (
        <AgendaView items={agendaItems} todayIso={todayIso} />
      ) : null}

      {!searching && view !== "focus" ? emailContent : null}

      <TaskDetailDialog
        task={
          detailTask
            ? tasks.find((task) => task.id === detailTask.id) ??
              otherTasks.result?.tasks.find((task) => task.id === detailTask.id) ??
              detailTask
            : null
        }
        assignees={assignees}
        projects={projects}
        currentUserId={currentUserId}
        canManage={canManage}
        onOptimisticUpdate={(fields) => {
          if (!detailTask) return undefined;
          const previous = tasks.find((task) => task.id === detailTask.id);
          const previousOther = otherTasks.result?.tasks.find((task) => task.id === detailTask.id);
          const mutation: TaskMutation = { type: "patch", taskId: detailTask.id, fields };
          setTasks((current) => applyTaskMutation(current, mutation));
          otherTasks.update((current) => applyTaskMutation(current, mutation));
          return () => {
            if (previous) {
              setTasks((current) =>
                current.map((task) => (task.id === previous.id ? previous : task))
              );
            }
            if (previousOther) {
              otherTasks.update((current) =>
                current.map((task) => (task.id === previousOther.id ? previousOther : task))
              );
            }
          };
        }}
        onOptimisticDelete={() => {
          if (!detailTask) return undefined;
          const previous = tasks.find((task) => task.id === detailTask.id);
          const previousIndex = tasks.findIndex((task) => task.id === detailTask.id);
          const previousOthers = otherTasks.result?.tasks ?? null;
          const mutation: TaskMutation = { type: "delete", taskId: detailTask.id };
          setTasks((current) => applyTaskMutation(current, mutation));
          otherTasks.update((current) => applyTaskMutation(current, mutation));
          return () => {
            if (previousOthers) otherTasks.update(() => previousOthers);
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
  tasks, currentUserId, todayIso, timeZone, completedToday, trackedTodaySeconds,
  activeTimer, pending, onOpen, onStatus, onTimer, onConfirmPayment, dueOnly, onShowAll,
  emailContent, hasEmailContent,
}: {
  tasks: MyWorkTaskRow[];
  currentUserId: string;
  todayIso: string;
  timeZone: string;
  completedToday: MyWorkTaskRow[];
  trackedTodaySeconds: number;
  activeTimer: ActiveTimer | null;
  pending: boolean;
  onOpen: (task: MyWorkTaskRow) => void;
  onStatus: (task: MyWorkTaskRow, status: Status) => void;
  onTimer: (task: MyWorkTaskRow) => void;
  onConfirmPayment?: (task: MyWorkTaskRow) => void;
  dueOnly: boolean;
  onShowAll: () => void;
  emailContent: React.ReactNode;
  hasEmailContent: boolean;
}) {
  const [showLater, setShowLater] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [showAllAttention, setShowAllAttention] = useState(false);
  const runningSeconds = useLiveElapsed(activeTimer?.startedAt ?? null);
  const open = tasks.filter(task => task.status !== "done");
  const dueWork = selectDueWorkTasks(open, currentUserId, todayIso, timeZone);
  const overdue = dueWork.filter(task => (printPaymentFollowUp(task, todayIso, timeZone)?.date ?? task.dueDate)! < todayIso);
  const { dueToday, remainingDueToday, nextUp, selectedCount, blockedNextUp, working, waiting, attention, later } = selectPersonalWork(open, todayIso, timeZone);
  const hasSecondary = hasEmailContent || waiting.length > 0 || later.length > 0 || completedToday.length > 0;

  return (
    <div className="space-y-5">
      {activeTimer ? (
        <div className="flex flex-col gap-3 rounded-xl border border-success/30 bg-success/8 px-4 py-3 sm:flex-row sm:items-center">
          <span className="relative flex size-3 shrink-0" aria-hidden>
            <span className="absolute inline-flex size-full animate-ping motion-reduce:animate-none rounded-full bg-success opacity-60" />
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

      <div className="@container/focus min-w-0">
        <div className={cn("grid min-w-0 items-start gap-8", hasSecondary && "@[76rem]/focus:grid-cols-[minmax(0,1fr)_26rem] @[100rem]/focus:gap-12")}>
          <div className="min-w-0 space-y-6">
            <dl aria-label="Work summary" className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
              <FocusStat label="Open" value={open.length} />
              <FocusStat label="Due today" value={dueToday.length} />
              <FocusStat label="Overdue" value={overdue.length} />
              <FocusStat label="Completed today" value={completedToday.length} />
              <FocusStat label="Tracked today" value={formatDuration(trackedTodaySeconds)} />
            </dl>
            {dueOnly ? <>
              <Button variant="ghost" size="sm" onClick={onShowAll}>Show all assigned work</Button>
              <FocusSection title="Tasks due" description="Due today or overdue, including printer-payment follow-ups."
                tasks={dueWork} todayIso={todayIso} timeZone={timeZone} pending={pending}
                activeTimerTaskId={activeTimer?.taskId ?? null} onOpen={onOpen} onStatus={onStatus} onTimer={onTimer} onConfirmPayment={onConfirmPayment} emptyTitle="No tasks due now" />
            </> : <>
              {nextUp.length > 0 ? <FocusSection id="next-up" title="Next up"
                description="Manager order across your projects · No due date needed" tasks={nextUp}
                todayIso={todayIso} timeZone={timeZone} pending={pending}
                activeTimerTaskId={activeTimer?.taskId ?? null} onOpen={onOpen} onStatus={onStatus} onTimer={onTimer} onConfirmPayment={onConfirmPayment} emptyTitle="Your selected tasks are waiting on a dependency or confirmation." /> : (
                selectedCount > 0 ? <p id="next-up" className="text-sm text-muted-foreground">Your selected tasks are waiting on a dependency or confirmation.</p> : null
              )}
              {blockedNextUp.length > 0 ? <FocusSection title="Next up · blocked"
                description="Selected work waiting on a dependency" tasks={blockedNextUp} todayIso={todayIso} timeZone={timeZone} pending={pending}
                activeTimerTaskId={activeTimer?.taskId ?? null} onOpen={onOpen} onStatus={onStatus} onTimer={onTimer} onConfirmPayment={onConfirmPayment} /> : null}
              {dueToday.length > 0 ? <FocusSection id="due-today" title="Due today"
                description={dueToday.length !== remainingDueToday.length ? `${dueToday.length - remainingDueToday.length} of today's tasks shown in Next up above` : "Today's deadlines and payment follow-ups"}
                tasks={remainingDueToday} totalCount={dueToday.length} todayIso={todayIso} timeZone={timeZone} pending={pending}
                activeTimerTaskId={activeTimer?.taskId ?? null} onOpen={onOpen} onStatus={onStatus} onTimer={onTimer} onConfirmPayment={onConfirmPayment}
                emptyTitle="Today's selected tasks are shown above in Next up" /> : null}
              {working.length > 0 ? <FocusSection title="Working now" description="In progress and waiting for review"
                tasks={working} todayIso={todayIso} timeZone={timeZone} pending={pending}
                activeTimerTaskId={activeTimer?.taskId ?? null} onOpen={onOpen} onStatus={onStatus} onTimer={onTimer} onConfirmPayment={onConfirmPayment} /> : null}
              <FocusSection title="Other assigned work" description="Overdue work, payment follow-ups, upcoming tasks, and undated work"
                tasks={showAllAttention ? attention : attention.slice(0, 5)} totalCount={attention.length}
                todayIso={todayIso} timeZone={timeZone} pending={pending}
                activeTimerTaskId={activeTimer?.taskId ?? null} onOpen={onOpen} onStatus={onStatus} onTimer={onTimer} onConfirmPayment={onConfirmPayment} emptyTitle="No other work needs attention right now" />
              {attention.length > 5 ? <Button variant="ghost" onClick={() => setShowAllAttention(value => !value)}>
                {showAllAttention ? "Show fewer tasks" : `Show all ${attention.length} tasks`}
              </Button> : null}
            </>}
          </div>
          {hasSecondary ? <aside aria-label="Email and other work" className="min-w-0 space-y-5 @[76rem]/focus:border-l @[76rem]/focus:pl-6">
            {emailContent}
            {waiting.length > 0 ? <SectionDisclosure id="waiting" title="Waiting on confirmation" summary={waiting.length}>
              <FocusSection title="Waiting on confirmation" description="Payment requests sent; follow-up dates bring them back to your action queue"
                tasks={waiting} todayIso={todayIso} timeZone={timeZone} pending={pending}
                activeTimerTaskId={activeTimer?.taskId ?? null} onOpen={onOpen} onStatus={onStatus} onTimer={onTimer} onConfirmPayment={onConfirmPayment} />
            </SectionDisclosure> : null}
            {later.length > 0 ? <CollapsibleSection title={`Later · ${later.length}`} description="Farther-future work kept out of your active queue"
              open={showLater} onToggle={() => setShowLater(value => !value)}>
              <FocusTaskList tasks={later} todayIso={todayIso} timeZone={timeZone} pending={pending}
                activeTimerTaskId={activeTimer?.taskId ?? null} onOpen={onOpen} onStatus={onStatus} onTimer={onTimer} onConfirmPayment={onConfirmPayment} />
            </CollapsibleSection> : null}
            {completedToday.length > 0 ? <CollapsibleSection title={`Completed today · ${completedToday.length}`} description="A quick record of today's progress"
              open={showCompleted} onToggle={() => setShowCompleted(value => !value)} tone="success">
              <FocusTaskList tasks={completedToday} todayIso={todayIso} timeZone={timeZone} pending={pending}
                activeTimerTaskId={activeTimer?.taskId ?? null} onOpen={onOpen} onStatus={onStatus} onTimer={onTimer} onConfirmPayment={onConfirmPayment} />
            </CollapsibleSection> : null}
          </aside> : null}
        </div>
      </div>
    </div>
  );
}

function FocusStat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function FocusSection({
  id,
  totalCount,
  title,
  description,
  tasks,
  todayIso,
  timeZone,
  pending,
  activeTimerTaskId,
  onOpen,
  onStatus,
  onTimer,
  onConfirmPayment,
  emptyTitle,
}: {
  id?: string;
  totalCount?: number;
  title: string;
  description: string;
  tasks: MyWorkTaskRow[];
  todayIso: string;
  timeZone: string;
  pending: boolean;
  activeTimerTaskId: string | null;
  onOpen: (task: MyWorkTaskRow) => void;
  onStatus: (task: MyWorkTaskRow, status: Status) => void;
  onTimer: (task: MyWorkTaskRow) => void;
  onConfirmPayment?: (task: MyWorkTaskRow) => void;
  emptyTitle?: string;
}) {
  return (
    <section id={id} className="scroll-mt-24 space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">{totalCount ?? tasks.length}</span>
      </div>
      {tasks.length > 0 ? (
        <FocusTaskList
          tasks={tasks}
          showNextUp={id !== "next-up"}
          todayIso={todayIso}
          timeZone={timeZone}
          pending={pending}
          activeTimerTaskId={activeTimerTaskId}
          onOpen={onOpen}
          onStatus={onStatus}
          onTimer={onTimer} onConfirmPayment={onConfirmPayment}
        />
      ) : (
        <div className="rounded-xl border bg-card py-10 text-center text-sm text-muted-foreground">
          {id === "next-up" ? <ListChecks className="mx-auto mb-2 size-5" /> : <Check className="mx-auto mb-2 size-5 text-success" />}
          {emptyTitle ?? "Nothing here"}
        </div>
      )}
    </section>
  );
}

function FocusTaskList({
  tasks,
  showNextUp = true,
  todayIso,
  timeZone,
  pending,
  activeTimerTaskId,
  onOpen,
  onStatus,
  onTimer,
  onConfirmPayment,
}: {
  tasks: MyWorkTaskRow[];
  showNextUp?: boolean;
  todayIso: string;
  timeZone: string;
  pending: boolean;
  activeTimerTaskId: string | null;
  onOpen: (task: MyWorkTaskRow) => void;
  onStatus: (task: MyWorkTaskRow, status: Status) => void;
  onTimer: (task: MyWorkTaskRow) => void;
  onConfirmPayment?: (task: MyWorkTaskRow) => void;
}) {
  return (
    <ul className="@container/tasklist divide-y overflow-hidden rounded-xl border bg-card" aria-busy={pending}>
      <AnimatePresence initial={false}>
        {tasks.map((task) => {
        const followUp = printPaymentFollowUp(task, todayIso, timeZone);
        const due = followUp
          ? { text: `${followUp.state === "due" ? "Follow up due" : "Follow up"} ${followUp.date}`, tone: followUp.state === "due" ? "soon" : "normal" }
          : dueLabel(task.dueDate, todayIso);
        const done = task.status === "done";
        const timerRunning = activeTimerTaskId === task.id;
        const controlled = isSourceControlledTask(task);
        const canConfirmPayment = Boolean(onConfirmPayment && task.printPaymentId && task.printPaymentStatus === "requested" && !done);
        const sourceLink = taskSourceLink(task, task.projectSlug);
        return (
          <motion.li
            data-task-id={task.id}
            key={task.id}
            layout
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.32, delay: 0.18, ease: EASE } }}
            transition={{ duration: 0.28, ease: EASE, layout: ROW_SPRING }}
            className={cn("flex items-start gap-2 px-3 py-3 sm:items-center sm:gap-3", canConfirmPayment && "flex-wrap @[40rem]/tasklist:flex-nowrap")}
          >
            {controlled ? (
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                {task.approvalAssignmentId ? <ShieldCheck className="size-5" /> : <CircleDollarSign className="size-5" />}
              </span>
            ) : (
              <TaskCompleteButton
                done={done}
                disabled={task.id.startsWith("optimistic-task-")}
                onToggle={() => onStatus(task, done ? "todo" : "done")}
                title={task.title}
                className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-success/10 hover:text-success focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              />
            )}
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => onOpen(task)}
                disabled={task.id.startsWith("optimistic-task-")}
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
                  <span>{task.projectTitle ?? "No project"}</span>
                )}
                {task.id.startsWith("optimistic-task-") ? <span role="status">Saving…</span> : null}
                {task.trackedSeconds > 0 ? (
                  <span className="flex items-center gap-1">
                    <Clock3 className="size-3" /> {formatDuration(task.trackedSeconds)}
                  </span>
                ) : null}
              </div>
              <TaskAttachmentShortcut task={task} />
              {task.blockedByTitle ? <p className="mt-1 text-xs text-warning-text">Blocked by {task.blockedByTitle}</p> : null}
              {showNextUp && task.isNextUp ? <span className="mt-1 inline-block text-xs font-medium text-primary">Next up</span> : null}
              {sourceLink ? <Link href={sourceLink.href} className="text-xs text-primary hover:underline">{sourceLink.label}</Link> : null}
              <p className={cn("mt-1 text-xs @[40rem]/tasklist:hidden", due.tone === "overdue" ? "font-medium text-destructive" : due.tone === "soon" ? "font-medium text-warning-text" : "text-muted-foreground")}>{due.tone === "none" ? "No due date" : due.text}</p>
            </div>
            <div className={cn("flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center", canConfirmPayment && "w-full flex-row justify-end @[40rem]/tasklist:w-auto")}>
              <div className="hidden items-center gap-2 @[40rem]/tasklist:flex">
                <span
                  className={cn(
                    "text-xs",
                    due.tone === "overdue" && "font-medium text-destructive",
                    due.tone === "soon" && "text-warning-text",
                    (due.tone === "normal" || due.tone === "none") && "text-muted-foreground"
                  )}
                >
                  {due.tone === "none" ? "No due date" : due.text}
                </span>
                {task.priority !== "medium" ? <PriorityBadge priority={task.priority} /> : null}
              </div>
              {!done ? (
                <Button
                  type="button"
                  size="icon-xs"
                  variant={timerRunning ? "destructive" : "ghost"}
                  disabled={task.id.startsWith("optimistic-task-")}
                  onClick={() => onTimer(task)}
                  aria-label={timerRunning ? `Stop timer for ${task.title}` : `Start timer for ${task.title}`}
                  title={timerRunning ? "Stop timer" : "Start timer"}
                >
                  {timerRunning ? <Square className="size-3.5 fill-current" /> : <Play className="size-3.5" />}
                </Button>
              ) : null}
              {canConfirmPayment ? (
                <Button type="button" size="sm" variant="outline" className="h-10 @[40rem]/tasklist:h-8" onClick={() => onConfirmPayment?.(task)}>
                  <CheckCircle2 className="size-3.5" />
                  Confirm printer paid
                </Button>
              ) : (
                <Select
                  value={task.status}
                  disabled={controlled || task.id.startsWith("optimistic-task-")}
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
              )}
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
  const visibleSections = sections.filter((section) => buckets[section.key].length > 0);
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
        <div className="@container/agenda min-w-0">
          <div
            className={cn(
              "grid min-w-0 items-start gap-5",
              visibleSections.length > 1 && "@[64rem]/agenda:grid-cols-2",
              visibleSections.length > 2 && "@[116rem]/agenda:grid-cols-[repeat(auto-fit,minmax(26rem,1fr))]"
            )}
          >
            {visibleSections.map((section) => {
              const rows = buckets[section.key];
              return (
                <section key={section.key} className="min-w-0 space-y-2">
                  <div className="flex items-baseline justify-between">
                    <h2 className={cn("text-lg font-semibold", section.destructive && "text-destructive")}>{section.label}</h2>
                    <span className="text-xs tabular-nums text-muted-foreground">{rows.length}</span>
                  </div>
                  <ul className="divide-y overflow-hidden rounded-xl border bg-card">
                    {rows.map((item) => (
                      <li key={item.id}><AgendaRow item={item} /></li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
