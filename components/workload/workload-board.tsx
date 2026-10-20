"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, GripVertical, Lock } from "lucide-react";

import { assignTask, reorderUserTasks, setTaskNextUp } from "@/lib/tasks/actions";
import { PriorityBadge } from "@/components/badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTip } from "@/components/ui/help-tip";
import { AnimatedBar } from "@/components/motion/animated-bar";
import { PERSON_OPEN_TASK_LIMIT, REVIEW_SLA_DAYS, reviewAgeDays } from "@/lib/flow";
import { daysUntil, dueLabel } from "@/lib/format";
import { utilizationPct, utilizationTone } from "@/lib/capacity";
import { secondsToHours } from "@/lib/time";
import { cn } from "@/lib/utils";
import { usePropState } from "@/hooks/use-prop-state";
import { TaskAttachmentShortcut } from "@/components/tasks/task-attachment-shortcut";

export type WorkloadTask = {
  id: string;
  title: string;
  projectTitle: string | null;
  unitName: string | null;
  dueDate: string | null;
  priority: string;
  status: string;
  isNextUp: boolean;
  updatedAt: Date | string;
  estimateHours: string | null;
  driveFileCount: number;
  driveFileName: string | null;
  driveFileUrl: string | null;
  /** Title of an unfinished task this one is blocked by, if any. */
  blockedBy: string | null;
};
export type WorkloadPerson = {
  userId: string;
  userName: string;
  queueRevision: number;
  queueUpdatedBy: string | null;
  tasks: WorkloadTask[];
  /** Weekly capacity in hours (0 if unset). */
  weeklyHours: number;
  /** Sum of open task estimateHours. */
  estHours: number;
  open: number;
  overdue: number;
  soon: number;
  /** Actual tracked seconds over the last 7 days (0 if none). */
  trackedSeconds: number;
  /** Standup stuck-risk, if flagged medium/high. */
  stuckRisk: "medium" | "high" | null;
  topImpediment: string | null;
};

/** Which person owns a task id, or the container id itself. */
function containerOf(people: WorkloadPerson[], id: string): string | undefined {
  if (people.some((p) => p.userId === id)) return id;
  return people.find((p) => p.tasks.some((t) => t.id === id))?.userId;
}

const withTasks = (
  list: WorkloadPerson[],
  idx: number,
  tasks: WorkloadTask[]
): WorkloadPerson[] => list.map((p, i) => (i === idx ? { ...p, tasks } : p));

export function WorkloadBoard({
  people: initial,
  onOpen,
  todayIso,
}: {
  people: WorkloadPerson[];
  todayIso: string;
  onOpen?: (taskId: string) => void;
}) {
  const router = useRouter();
  const inFlight = useRef(new Set<string>());
  const [pendingPeople, setPendingPeople] = useState(new Set<string>());
  const [people, setPeople] = usePropState(initial);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const commit = (next: WorkloadPerson[], affected: string[], action: () => Promise<Record<string, number> | void>) => {
    if (affected.some(id => inFlight.current.has(id))) return;
    const previous = people;
    affected.forEach(id => inFlight.current.add(id));
    setPendingPeople(new Set(inFlight.current));
    setPeople(next);
    void (async () => {
      try {
        const revisions = await action();
        if (revisions) setPeople(current => current.map(person => revisions[person.userId] === undefined ? person : { ...person, queueRevision: revisions[person.userId] }));
      } catch (error) {
        setPeople(current => current.map(person => affected.includes(person.userId) ? previous.find(old => old.userId === person.userId)! : person));
        toast.error(
          error instanceof Error ? error.message : "Could not save the workload change."
        );
      } finally {
        affected.forEach(id => inFlight.current.delete(id));
        setPendingPeople(new Set(inFlight.current));
        if (inFlight.current.size === 0) router.refresh();
      }
    })();
  };

  const saveOrder = (personIdx: number, next: WorkloadTask[]) => {
    const person = people[personIdx];
    commit(withTasks(people, personIdx, next), [person.userId], async () => {
      const queue = await reorderUserTasks(person.userId, next.map(task => task.id), person.queueRevision);
      return { [person.userId]: queue!.revision };
    });
  };

  const toggleNextUp = (personIdx: number, taskIndex: number) => {
    const person = people[personIdx];
    const task = person.tasks[taskIndex];
    const changed = { ...task, isNextUp: !task.isNextUp };
    const rest = person.tasks.filter(item => item.id !== task.id);
    const next = changed.isNextUp
      ? [...rest.filter(item => item.isNextUp), changed, ...rest.filter(item => !item.isNextUp)]
      : [...rest, changed];
    commit(withTasks(people, personIdx, next), [person.userId], async () => {
      const result = await setTaskNextUp(task.id, changed.isNextUp, person.queueRevision);
      return { [person.userId]: result.queue!.revision };
    });
  };

  const reorderWithin = (personIdx: number, from: number, to: number) => {
    const list = people[personIdx].tasks;
    if (to < 0 || to >= list.length || from === to) return;
    if (list[from].isNextUp !== list[to].isNextUp) return;
    const next = arrayMove(list, from, to);
    saveOrder(personIdx, next);
  };

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const activeTaskId = String(active.id);
    const overId = String(over.id);
    const from = containerOf(people, activeTaskId);
    const to = containerOf(people, overId);
    if (!from || !to) return;
    if (inFlight.current.has(from) || inFlight.current.has(to)) return;
    const fromIdx = people.findIndex((p) => p.userId === from);
    const toIdx = people.findIndex((p) => p.userId === to);

    if (from === to) {
      const list = people[fromIdx].tasks;
      const oldIndex = list.findIndex((t) => t.id === activeTaskId);
      const newIndex =
        overId === to ? list.length - 1 : list.findIndex((t) => t.id === overId);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
      if (list[oldIndex].isNextUp !== list[newIndex].isNextUp) return;
      const next = arrayMove(list, oldIndex, newIndex);
      saveOrder(fromIdx, next);
      return;
    }

    // Reassign: move the task from `from` to `to`.
    const task = people[fromIdx].tasks.find((t) => t.id === activeTaskId);
    if (!task) return;
    const sourceTasks = people[fromIdx].tasks.filter((t) => t.id !== activeTaskId);
    const targetList = people[toIdx].tasks;
    const targetTasks = [...targetList, { ...task, isNextUp: false }];
    let next = withTasks(people, fromIdx, sourceTasks);
    next = withTasks(next, toIdx, targetTasks);
    const targetUserId = people[toIdx].userId;
    commit(next, [from, to], async () => {
      return assignTask(activeTaskId, targetUserId);
    });
  };

  if (people.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No active team members.</p>
    );
  }

  const activeTask = activeId
    ? people.flatMap((p) => p.tasks).find((t) => t.id === activeId)
    : null;

  return (
    <DndContext
      id="workload"
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,26rem),1fr))] gap-4">
        {people.map((person, pi) => (
          <PersonCard
            key={person.userId}
            person={person}
            todayIso={todayIso}
            pending={pendingPeople.has(person.userId)}
            onOpen={onOpen}
            onUp={(ti) => reorderWithin(pi, ti, ti - 1)}
            onDown={(ti) => reorderWithin(pi, ti, ti + 1)}
            onNextUp={(ti) => toggleNextUp(pi, ti)}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? (
          <div className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-sm font-medium shadow-md">
            <GripVertical className="size-4 text-muted-foreground/60" />
            <span className="truncate">{activeTask.title}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function PersonCard({
  person,
  todayIso,
  pending,
  onOpen,
  onUp,
  onDown,
  onNextUp,
}: {
  person: WorkloadPerson;
  todayIso: string;
  pending: boolean;
  onOpen?: (taskId: string) => void;
  onUp: (taskIndex: number) => void;
  onDown: (taskIndex: number) => void;
  onNextUp: (taskIndex: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: person.userId });
  const ids = person.tasks.map((t) => t.id);
  const nextUpCount = person.tasks.filter(task => task.isNextUp).length;

  // Derive live stats from the (optimistic) task list so a drag updates them.
  const open = person.tasks.length;
  const estHours = person.tasks.reduce(
    (s, t) => s + Number(t.estimateHours ?? 0),
    0
  );
  const overdue = person.tasks.filter((t) => {
    const d = daysUntil(t.dueDate, todayIso);
    return d !== null && d < 0;
  }).length;
  const inProgress = person.tasks.filter((t) => t.status === "in_progress").length;
  const staleReview = person.tasks.filter((t) => {
    const age = reviewAgeDays(t.status, t.updatedAt);
    return age !== null && age >= REVIEW_SLA_DAYS;
  }).length;
  const overLimit = open > PERSON_OPEN_TASK_LIMIT;

  const util = utilizationPct({ weeklyHours: person.weeklyHours, estHours });
  const hoursMode = util !== null;
  const barValue = hoursMode
    ? Math.min(100, util)
    : Math.min(100, Math.round((open / PERSON_OPEN_TASK_LIMIT) * 100));
  const barCls = hoursMode
    ? utilizationTone(util) === "over"
      ? "bg-destructive"
      : utilizationTone(util) === "high"
        ? "bg-warning"
        : "bg-success"
    : overLimit
      ? "bg-warning"
      : "bg-primary";
  const estLabel = Number.isInteger(estHours) ? `${estHours}` : estHours.toFixed(1);

  return (
    <Card className={cn(isOver && "ring-2 ring-primary/40")}>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="flex items-center gap-1.5 text-base">
            {person.userName}
            <HelpTip side="bottom" align="start" title="Balance & sequence">
              Choose Next up, then order those tasks without setting dates.
              Drag within a group to reorder. Drop onto another person to add to their standard queue.
            </HelpTip>
          </CardTitle>
          <div className="flex flex-wrap items-center justify-end gap-1.5 text-xs">
            {person.stuckRisk ? (
              <Badge
                className="bg-destructive/10 text-destructive"
                title={person.topImpediment ?? "Flagged in standup"}
              >
                At risk
              </Badge>
            ) : null}
            {overdue > 0 ? (
              <Badge className="bg-destructive text-destructive-foreground tabular-nums">
                {overdue} overdue
              </Badge>
            ) : null}
            {inProgress > 0 ? (
              <Badge className="bg-info text-info-foreground tabular-nums">
                {inProgress} active
              </Badge>
            ) : null}
            {overLimit ? (
              <Badge className="bg-warning text-warning-foreground tabular-nums">
                WIP {open}/{PERSON_OPEN_TASK_LIMIT}
              </Badge>
            ) : null}
            {staleReview > 0 ? (
              <Badge className="bg-destructive/10 text-destructive tabular-nums">
                {staleReview} stale review
              </Badge>
            ) : null}
          </div>
        </div>
        {/* Capacity / load bar */}
        <div className="mt-1.5 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{hoursMode ? "Load (hours)" : "Load"}</span>
            <span className="tabular-nums">
              {hoursMode
                ? `${estLabel}h / ${person.weeklyHours}h · ${util}%`
                : `${open} open ${open === 1 ? "task" : "tasks"}`}
            </span>
          </div>
          <AnimatedBar value={barValue} className={barCls} trackClassName="h-1.5" />
          {person.trackedSeconds > 0 ? (
            <p className="text-[11px] text-muted-foreground tabular-nums">
              {Math.round(secondsToHours(person.trackedSeconds) * 10) / 10}h tracked this week
            </p>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-muted-foreground" role="status">
          {pending ? "Saving queue…" : person.queueUpdatedBy ? `Queue last changed by ${person.queueUpdatedBy}` : "Choose the next few tasks for this teammate."}
        </p>
        <div
          ref={setNodeRef}
          className={cn(
            "min-h-12 space-y-1.5 rounded-md transition-colors",
            isOver && "bg-primary/5"
          )}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            {person.tasks.length === 0 ? (
              <p className="py-3 text-center text-xs text-muted-foreground">
                {isOver
                  ? "Drop to assign here"
                  : "No open tasks — drop one here to assign."}
              </p>
            ) : (
              person.tasks.map((t, ti) => (
                <div key={t.id}>
                {(ti === 0 || person.tasks[ti - 1].isNextUp !== t.isNextUp) ? (
                  <h3 className="pb-2 pt-3 text-sm font-semibold">{t.isNextUp ? "Next up · manager order" : "Other assigned work"}</h3>
                ) : null}
                <SortableRow
                  key={t.id}
                  task={t}
                  todayIso={todayIso}
                  index={t.isNextUp ? ti : ti - nextUpCount}
                  count={t.isNextUp ? nextUpCount : person.tasks.length - nextUpCount}
                  pending={pending}
                  onOpen={onOpen}
                  onUp={() => onUp(ti)}
                  onDown={() => onDown(ti)}
                  onNextUp={() => onNextUp(ti)}
                />
                </div>
              ))
            )}
          </SortableContext>
        </div>
      </CardContent>
    </Card>
  );
}

function SortableRow({
  task: t,
  todayIso,
  index,
  count,
  pending,
  onOpen,
  onUp,
  onDown,
  onNextUp,
}: {
  task: WorkloadTask;
  todayIso: string;
  index: number;
  count: number;
  pending: boolean;
  onOpen?: (taskId: string) => void;
  onUp: () => void;
  onDown: () => void;
  onNextUp: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: t.id, disabled: pending });
  const due = dueLabel(t.dueDate, todayIso);
  const reviewAge = reviewAgeDays(t.status, t.updatedAt);
  const staleReview = reviewAge !== null && reviewAge >= REVIEW_SLA_DAYS;
  const inProgress = t.status === "in_progress";
  const hours = Number(t.estimateHours ?? 0);
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div
      data-task-id={t.id}
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 rounded-md border bg-card px-2 py-1.5",
        t.isNextUp && "border-primary/30 bg-primary/5",
        isDragging && "z-10 opacity-50"
      )}
    >
      <button
        type="button"
        aria-label="Drag to reorder or reassign"
        className="-ml-1 flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground/60 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 active:cursor-grabbing pointer-coarse:size-11"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <span className="w-5 text-center text-xs tabular-nums text-muted-foreground">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        {onOpen ? (
          <button
            type="button"
            onClick={() => onOpen(t.id)}
            className="line-clamp-2 max-w-full cursor-pointer text-left text-sm font-medium hover:underline sm:block sm:truncate"
          >
            {t.title}
          </button>
        ) : (
          <p className="truncate text-sm font-medium">{t.title}</p>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          <PriorityBadge priority={t.priority} />
          {inProgress ? (
            <span className="shrink-0 rounded bg-info/15 px-1.5 py-0.5 text-[11px] font-medium text-info">
              In progress
            </span>
          ) : null}
          {t.blockedBy ? (
            <span
              title={`Waiting on: ${t.blockedBy}`}
              className="flex shrink-0 items-center gap-0.5 rounded bg-warning/20 px-1.5 py-0.5 text-[11px] font-medium text-warning-text"
            >
              <Lock className="size-3" /> Blocked
            </span>
          ) : null}
          <span className="truncate text-xs text-muted-foreground">
            {t.projectTitle ?? "No project"}
          </span>
          <span
            className={cn(
              "text-xs",
              due.tone === "overdue" && "font-medium text-destructive",
              due.tone === "soon" && "text-warning"
            )}
          >
            {due.tone !== "none" ? `· ${due.text}` : "· No due date"}
          </span>
          {hours > 0 ? (
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              · {Number.isInteger(hours) ? hours : hours.toFixed(1)}h
            </span>
          ) : null}
          {reviewAge !== null ? (
            <span
              className={cn(
                "shrink-0 text-xs tabular-nums",
                staleReview ? "font-medium text-destructive" : "text-muted-foreground"
              )}
            >
              · review {reviewAge}d
            </span>
          ) : null}
        </div>
        <TaskAttachmentShortcut task={t} className="mt-1.5" />
        <Button type="button" variant="ghost" size="sm" className="mt-1 min-h-11 px-1 text-xs" disabled={pending} onClick={onNextUp} aria-label={`${t.isNextUp ? "Remove" : "Add"} ${t.title} ${t.isNextUp ? "from" : "to"} Next up`}>
          {t.isNextUp ? "Remove from Next up" : "Add to Next up"}
        </Button>
      </div>
      <div className="flex flex-col">
        <Button
          variant="ghost"
          size="icon-xs"
          className="size-8 pointer-coarse:size-11"
          aria-label={`Move ${t.title} up`}
          disabled={pending || index === 0}
          onClick={onUp}
        >
          <ArrowUp className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          className="size-8 pointer-coarse:size-11"
          aria-label={`Move ${t.title} down`}
          disabled={pending || index === count - 1}
          onClick={onDown}
        >
          <ArrowDown className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
