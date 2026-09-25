"use client";

import { useState } from "react";
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
  CircleDot,
  Clock3,
  Flag,
  GripVertical,
  Lock,
  Play,
  Square,
} from "lucide-react";

import type { MyWorkTaskRow } from "@/lib/tasks/queries";
import { TASK_STATUS, TASK_STATUS_ORDER, PriorityBadge } from "@/components/badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TaskAttachmentShortcut } from "@/components/tasks/task-attachment-shortcut";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { REVIEW_SLA_DAYS, TASK_WIP_LIMITS, reviewAgeDays } from "@/lib/flow";
import { dueLabel } from "@/lib/format";
import { formatDuration } from "@/lib/time";
import { cn } from "@/lib/utils";

type Status = (typeof TASK_STATUS_ORDER)[number];

export function PersonalTaskBoard({
  tasks,
  projects,
  blockedByTaskId,
  activeTimerTaskId,
  pending,
  onOpen,
  onStatus,
  onTimer,
}: {
  tasks: MyWorkTaskRow[];
  projects: { id: string; name: string }[];
  blockedByTaskId: Record<string, string>;
  activeTimerTaskId: string | null;
  pending: boolean;
  onOpen: (task: MyWorkTaskRow) => void;
  onStatus: (task: MyWorkTaskRow, status: Status) => void;
  onTimer: (task: MyWorkTaskRow) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mobileStatus, setMobileStatus] = useState<Status>("in_progress");
  const [projectId, setProjectId] = useState("all");
  const [priority, setPriority] = useState("all");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  const filtered = tasks.filter(
    (task) =>
      (projectId === "all" || task.projectId === projectId) &&
      (priority === "all" || task.priority === priority)
  );
  const columns = TASK_STATUS_ORDER.map((status) => ({
    status,
    tasks: filtered.filter((task) => task.status === status),
  }));
  const activeTask = activeId
    ? filtered.find((task) => task.id === activeId) ?? null
    : null;

  const onDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    if (!event.over) return;
    const task = filtered.find((item) => item.id === String(event.active.id));
    const status = String(event.over.id) as Status;
    if (!task || task.status === status || !TASK_STATUS_ORDER.includes(status)) {
      return;
    }
    onStatus(task, status);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Drag work between stages. Completed tasks remain visible for seven days.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Select value={projectId} onValueChange={(value) => setProjectId(value ?? "all")}>
            <SelectTrigger aria-label="Filter by project" className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={priority} onValueChange={(value) => setPriority(value ?? "all")}>
            <SelectTrigger aria-label="Filter by priority" className="w-full sm:w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1 rounded-lg bg-muted p-1 md:hidden">
        {columns.map((column) => (
          <button
            key={column.status}
            type="button"
            onClick={() => setMobileStatus(column.status)}
            aria-pressed={mobileStatus === column.status}
            className={cn(
              "min-h-10 rounded-md px-1 text-xs font-medium transition-colors",
              mobileStatus === column.status
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground"
            )}
          >
            <span className="block truncate">{TASK_STATUS[column.status].label}</span>
            <span className="tabular-nums">{column.tasks.length}</span>
          </button>
        ))}
      </div>

      <DndContext
        id="personal-task-board"
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={(event: DragStartEvent) => setActiveId(String(event.active.id))}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="md:hidden" aria-busy={pending}>
          {columns
            .filter((column) => column.status === mobileStatus)
            .map((column) => (
              <BoardColumn key={column.status} status={column.status} tasks={column.tasks}>
                {column.tasks.map((task) => (
                  <BoardTask
                    key={task.id}
                    task={task}
                    blockedBy={blockedByTaskId[task.id]}
                    timerRunning={activeTimerTaskId === task.id}
                    onOpen={() => onOpen(task)}
                    onStatus={(status) => onStatus(task, status)}
                    onTimer={() => onTimer(task)}
                  />
                ))}
              </BoardColumn>
            ))}
        </div>

        <div className="hidden gap-4 md:grid md:grid-cols-2 xl:grid-cols-4" aria-busy={pending}>
          {columns.map((column) => (
            <BoardColumn key={column.status} status={column.status} tasks={column.tasks}>
              {column.tasks.map((task) => (
                <BoardTask
                  key={task.id}
                  task={task}
                  blockedBy={blockedByTaskId[task.id]}
                  timerRunning={activeTimerTaskId === task.id}
                  onOpen={() => onOpen(task)}
                  onStatus={(status) => onStatus(task, status)}
                  onTimer={() => onTimer(task)}
                />
              ))}
            </BoardColumn>
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeTask ? (
            <div className="w-72 rotate-1 rounded-lg border bg-card p-3 shadow-lg">
              <TaskCardContent task={activeTask} blockedBy={blockedByTaskId[activeTask.id]} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function BoardColumn({
  status,
  tasks,
  children,
}: {
  status: Status;
  tasks: MyWorkTaskRow[];
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const limit = TASK_WIP_LIMITS[status];
  const overLimit = limit !== undefined && tasks.length > limit;
  const stale =
    status === "review"
      ? tasks.filter((task) => {
          const age = reviewAgeDays(task.status, task.updatedAt);
          return age !== null && age >= REVIEW_SLA_DAYS;
        }).length
      : 0;

  return (
    <section className="space-y-2" aria-labelledby={`personal-column-${status}`}>
      <div className="flex min-h-8 items-center justify-between gap-2 px-1">
        <h2 id={`personal-column-${status}`} className="flex items-center gap-1.5 text-sm font-semibold">
          {TASK_STATUS[status].label}
          {overLimit ? (
            <Badge className="bg-warning/20 text-warning-foreground">
              <AlertTriangle className="size-3" /> WIP
            </Badge>
          ) : null}
          {stale > 0 ? (
            <Badge variant="destructive">
              <Clock3 className="size-3" /> {stale} stale
            </Badge>
          ) : null}
        </h2>
        <span className="text-xs tabular-nums text-muted-foreground">
          {tasks.length}{limit ? `/${limit}` : ""}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "min-h-28 space-y-2 rounded-xl border bg-muted/35 p-2 transition-colors",
          isOver && "border-primary bg-primary/5"
        )}
      >
        {children}
        {tasks.length === 0 ? (
          <p className="flex min-h-20 items-center justify-center text-xs text-muted-foreground">
            Drop tasks here
          </p>
        ) : null}
      </div>
    </section>
  );
}

function BoardTask({
  task,
  blockedBy,
  timerRunning,
  onOpen,
  onStatus,
  onTimer,
}: {
  task: MyWorkTaskRow;
  blockedBy?: string;
  timerRunning: boolean;
  onOpen: () => void;
  onStatus: (status: Status) => void;
  onTimer: () => void;
}) {
  const protectedTask = Boolean(task.approvalAssignmentId);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    disabled: protectedTask,
  });

  return (
    <article
      ref={setNodeRef}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={cn(
        "rounded-lg border bg-card p-3 shadow-xs transition-[border-color,box-shadow,opacity]",
        isDragging && "opacity-25"
      )}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          className={cn(
            "mt-0.5 flex size-7 shrink-0 touch-none items-center justify-center rounded-md text-muted-foreground",
            protectedTask ? "cursor-not-allowed" : "cursor-grab hover:bg-muted active:cursor-grabbing"
          )}
          aria-label={protectedTask ? "Protected approval task" : `Drag ${task.title}`}
          title={protectedTask ? "Protected approval task" : "Drag task"}
          {...attributes}
          {...listeners}
        >
          {protectedTask ? <Lock className="size-3.5" /> : <GripVertical className="size-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <TaskCardContent task={task} blockedBy={blockedBy} onOpen={onOpen} />
          <div className="mt-3 flex items-center justify-between gap-2 border-t pt-2">
            <Select
              value={task.status}
              disabled={protectedTask}
              itemToStringLabel={(status) => TASK_STATUS[status].label}
              onValueChange={(value) => value && onStatus(value as Status)}
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
            {task.status !== "done" ? (
              <Button
                type="button"
                size="icon-xs"
                variant={timerRunning ? "destructive" : "ghost"}
                onClick={onTimer}
                aria-label={timerRunning ? `Stop timer for ${task.title}` : `Start timer for ${task.title}`}
                title={timerRunning ? "Stop timer" : "Start timer"}
              >
                {timerRunning ? <Square className="size-3.5 fill-current" /> : <Play className="size-3.5" />}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function TaskCardContent({
  task,
  blockedBy,
  onOpen,
}: {
  task: MyWorkTaskRow;
  blockedBy?: string;
  onOpen?: () => void;
}) {
  const due = dueLabel(task.dueDate);
  const estimateSeconds = Number(task.estimateHours ?? 0) * 3600;
  return (
    <div className="min-w-0">
      {onOpen ? (
        <button type="button" onClick={onOpen} className="line-clamp-2 text-left text-sm font-semibold hover:underline">
          {task.isMilestone ? <Flag className="mr-1 inline size-3.5 text-warning" /> : null}
          {task.title}
        </button>
      ) : (
        <p className="line-clamp-2 text-sm font-semibold">{task.title}</p>
      )}
      <p className="mt-0.5 truncate text-xs text-muted-foreground">
        {task.projectTitle ?? "No project"}
      </p>
      <TaskAttachmentShortcut task={task} />
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <PriorityBadge priority={task.priority} />
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
      </div>
      {(task.trackedSeconds > 0 || estimateSeconds > 0) ? (
        <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
          <Clock3 className="size-3.5" />
          {formatDuration(task.trackedSeconds)} tracked
          {estimateSeconds > 0 ? ` / ${formatDuration(estimateSeconds)} estimate` : ""}
        </p>
      ) : null}
      {blockedBy ? (
        <p className="mt-2 flex items-start gap-1 text-xs text-warning-foreground">
          <CircleDot className="mt-0.5 size-3 shrink-0" />
          <span className="line-clamp-2">Blocked by {blockedBy}</span>
        </p>
      ) : null}
    </div>
  );
}
