"use client";

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { updateTaskFields } from "@/lib/tasks/actions";
import { shiftPhase, updatePhaseDates } from "@/lib/projects/phase-actions";
import {
  addDaysYmd,
  buildScale,
  ganttRange,
  pxToDayDelta,
} from "@/lib/timeline/scale";
import { cn } from "@/lib/utils";
import { usePropState } from "@/hooks/use-prop-state";

export type GanttPhase = {
  id: string;
  name: string;
  startDate: string | null;
  dueDate: string | null;
  color: string | null;
};

export type GanttTask = {
  id: string;
  title: string;
  dueDate: string; // dated tasks only
  phaseId: string | null;
  status: string;
  isMilestone: boolean;
};

export type GanttDep = {
  /** Predecessor task id (must finish first). */
  fromTaskId: string;
  /** Dependent task id (waits on the predecessor). */
  toTaskId: string;
};

const ROW_H = 34;
const HEADER_H = 26;
const ZOOMS = [
  { key: "fit", label: "Fit" },
  { key: "quarter", label: "Quarter" },
  { key: "month", label: "Month" },
] as const;
type ZoomKey = (typeof ZOOMS)[number]["key"];

function taskTone(t: GanttTask, today: string): string {
  if (t.status === "done") return "var(--success)";
  if (t.dueDate < today) return "var(--destructive)";
  return "var(--info)";
}

type Drag =
  | { kind: "task"; id: string; startX: number; dx: number }
  | { kind: "phase-move"; id: string; startX: number; dx: number }
  | { kind: "phase-resize"; id: string; startX: number; dx: number };

function shiftVisiblePhases(
  phases: GanttPhase[],
  phaseId: string,
  delta: number,
  cascade: boolean
) {
  const phaseIndex = phases.findIndex((phase) => phase.id === phaseId);
  return phases.map((phase, index) =>
    index === phaseIndex || (cascade && index > phaseIndex)
      ? {
          ...phase,
          startDate: phase.startDate
            ? addDaysYmd(phase.startDate, delta)
            : null,
          dueDate: phase.dueDate ? addDaysYmd(phase.dueDate, delta) : null,
        }
      : phase
  );
}

/**
 * Interactive project Gantt: phase bars with task/milestone markers, dependency
 * arrows, zoom, and (for managers) drag-to-reschedule with one-click undo.
 */
export function Gantt({
  phases: initialPhases,
  tasks: initialTasks,
  deps,
  today,
  canEdit,
  tasksHref,
}: {
  phases: GanttPhase[];
  tasks: GanttTask[];
  deps: GanttDep[];
  today: string;
  canEdit: boolean;
  tasksHref: string;
}) {
  const router = useRouter();
  const [phases, setPhases] = usePropState(initialPhases);
  const [tasks, setTasks] = usePropState(initialTasks);
  const [, startTransition] = useTransition();
  const [zoom, setZoom] = useState<ZoomKey>("fit");
  const [cascade, setCascade] = useState(true);
  const [drag, setDrag] = useState<Drag | null>(null);
  /** True once a pointer actually moved — suppresses the click after a drag. */
  const didDragRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [fitWidth, setFitWidth] = useState(800);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setFitWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const range = useMemo(
    () =>
      ganttRange(
        [
          ...phases.flatMap((p) => [p.startDate, p.dueDate]),
          ...tasks.map((t) => t.dueDate),
        ],
        today
      ),
    [phases, tasks, today]
  );

  const scale = useMemo(() => {
    const spanDays = Math.max(
      1,
      Math.round(
        ((Date.parse(`${range.maxYmd}T00:00:00Z`) || 0) -
          (Date.parse(`${range.minYmd}T00:00:00Z`) || 0)) /
          86_400_000
      )
    );
    const pxPerDay =
      zoom === "fit"
        ? Math.max(1, fitWidth - 2) / spanDays
        : zoom === "quarter"
          ? 4
          : 9;
    return buildScale({ ...range, pxPerDay });
  }, [range, zoom, fitWidth]);

  // Rows: phases in order, then a synthetic row for dated tasks with no phase.
  const phaseIds = new Set(phases.map((p) => p.id));
  const orphanTasks = tasks.filter((t) => !t.phaseId || !phaseIds.has(t.phaseId));
  const rows: { id: string; label: string; phase: GanttPhase | null }[] = [
    ...phases.map((p) => ({ id: p.id, label: p.name, phase: p as GanttPhase | null })),
    ...(orphanTasks.length
      ? [{ id: "__other", label: "Other tasks", phase: null }]
      : []),
  ];
  const rowIndexById = new Map(rows.map((r, i) => [r.id, i]));
  const rowIndexForTask = (t: GanttTask) =>
    rowIndexById.get(t.phaseId && phaseIds.has(t.phaseId) ? t.phaseId : "__other") ?? 0;
  const taskById = new Map(tasks.map((t) => [t.id, t]));

  const contentH = HEADER_H + rows.length * ROW_H;
  const dayDelta = drag ? pxToDayDelta(drag.dx, scale.pxPerDay) : 0;
  const dragPx = dayDelta * scale.pxPerDay;

  // Month ticks with labels thinned so they never overlap at tight zooms.
  const monthTicks = useMemo(() => {
    const out: { x: number; label: string; showLabel: boolean }[] = [];
    for (const m of scale.months) {
      const prev = out.filter((t) => t.showLabel).at(-1);
      out.push({ ...m, showLabel: prev === undefined || m.x - prev.x >= 44 });
    }
    return out;
  }, [scale]);

  // ── drag plumbing ───────────────────────────────────────────────────────────
  function beginDrag(e: React.PointerEvent, d: Drag) {
    if (!canEdit) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      // Synthetic/stale pointers can't be captured — dragging still works.
    }
    didDragRef.current = false;
    setDrag(d);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    if (Math.abs(dx) > 3) didDragRef.current = true;
    setDrag({ ...drag, dx });
  }
  function onPointerUp() {
    if (!drag) return;
    const delta = pxToDayDelta(drag.dx, scale.pxPerDay);
    const d = drag;
    setDrag(null);
    if (delta === 0) return;

    if (d.kind === "task") {
      const task = taskById.get(d.id);
      if (!task) return;
      const previous = task.dueDate;
      const next = addDaysYmd(previous, delta);
      setTasks((current) =>
        current.map((item) =>
          item.id === d.id ? { ...item, dueDate: next } : item
        )
      );
      startTransition(async () => {
        try {
          await updateTaskFields(d.id, { dueDate: next });
          toast.success(`"${task.title}" due ${next}`, {
            action: {
              label: "Undo",
              onClick: () => {
                setTasks((current) =>
                  current.map((item) =>
                    item.id === d.id ? { ...item, dueDate: previous } : item
                  )
                );
                startTransition(async () => {
                  try {
                    await updateTaskFields(d.id, { dueDate: previous });
                    router.refresh();
                  } catch (error) {
                    setTasks((current) =>
                      current.map((item) =>
                        item.id === d.id ? { ...item, dueDate: next } : item
                      )
                    );
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : "Could not undo the date change."
                    );
                  }
                });
              },
            },
          });
          router.refresh();
        } catch (error) {
          setTasks((current) =>
            current.map((item) =>
              item.id === d.id ? { ...item, dueDate: previous } : item
            )
          );
          toast.error(
            error instanceof Error
              ? error.message
              : "Could not reschedule the task."
          );
        }
      });
      return;
    }

    if (d.kind === "phase-move") {
      const previous = phases;
      const shifted = shiftVisiblePhases(previous, d.id, delta, cascade);
      setPhases(shifted);
      startTransition(async () => {
        try {
          const res = await shiftPhase(d.id, delta, cascade);
          if (res.error) throw new Error(res.error);
          toast.success(
            `Shifted ${res.shifted} phase${res.shifted === 1 ? "" : "s"} by ${delta > 0 ? "+" : ""}${delta}d`,
            {
              action: {
                label: "Undo",
                onClick: () => {
                  setPhases(previous);
                  startTransition(async () => {
                    try {
                      const undo = await shiftPhase(d.id, -delta, cascade);
                      if (undo.error) throw new Error(undo.error);
                      router.refresh();
                    } catch (error) {
                      setPhases(shifted);
                      toast.error(
                        error instanceof Error
                          ? error.message
                          : "Could not undo the phase shift."
                      );
                    }
                  });
                },
              },
            }
          );
          router.refresh();
        } catch (error) {
          setPhases(previous);
          toast.error(
            error instanceof Error ? error.message : "Could not shift the phase."
          );
        }
      });
      return;
    }

    const phase = phases.find((item) => item.id === d.id);
    if (!phase?.dueDate) return;
    const previous = phase.dueDate;
    const next = addDaysYmd(previous, delta);
    if (phase.startDate && next < phase.startDate) {
      toast.error("A phase can't end before it starts.");
      return;
    }
    setPhases((current) =>
      current.map((item) =>
        item.id === d.id ? { ...item, dueDate: next } : item
      )
    );
    startTransition(async () => {
      try {
        const res = await updatePhaseDates(d.id, { dueDate: next });
        if (res.error) throw new Error(res.error);
        toast.success(`"${phase.name}" ends ${next}`, {
          action: {
            label: "Undo",
            onClick: () => {
              setPhases((current) =>
                current.map((item) =>
                  item.id === d.id ? { ...item, dueDate: previous } : item
                )
              );
              startTransition(async () => {
                try {
                  const undo = await updatePhaseDates(d.id, {
                    dueDate: previous,
                  });
                  if (undo.error) throw new Error(undo.error);
                  router.refresh();
                } catch (error) {
                  setPhases((current) =>
                    current.map((item) =>
                      item.id === d.id ? { ...item, dueDate: next } : item
                    )
                  );
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Could not undo the phase date."
                  );
                }
              });
            },
          },
        });
        router.refresh();
      } catch (error) {
        setPhases((current) =>
          current.map((item) =>
            item.id === d.id ? { ...item, dueDate: previous } : item
          )
        );
        toast.error(
          error instanceof Error ? error.message : "Could not resize the phase."
        );
      }
    });
  }

  const shiftFor = (kind: Drag["kind"], id: string) =>
    drag && drag.kind === kind && drag.id === id ? dragPx : 0;

  // Cascade preview: when moving a phase with cascade on, later phases shadow it.
  const movingIndex =
    drag?.kind === "phase-move" ? (rowIndexById.get(drag.id) ?? -1) : -1;
  const cascadeShift = (rowIdx: number) =>
    cascade && movingIndex >= 0 && rowIdx > movingIndex ? dragPx : 0;

  const todayX = scale.x(today);

  return (
    <div className="min-w-0 max-w-full space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border p-0.5 text-xs">
          {ZOOMS.map((z) => (
            <button
              key={z.key}
              type="button"
              onClick={() => setZoom(z.key)}
              className={cn(
                "min-h-7 rounded-md px-2 py-0.5 transition-colors pointer-coarse:min-h-11 pointer-coarse:px-3",
                zoom === z.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {z.label}
            </button>
          ))}
        </div>
        {canEdit ? (
          <label className="flex min-h-7 items-center gap-1.5 text-xs text-muted-foreground pointer-coarse:min-h-11">
            <input
              type="checkbox"
              checked={cascade}
              onChange={(e) => setCascade(e.target.checked)}
              className="size-3.5 accent-[var(--primary)]"
            />
            Shift later phases too
          </label>
        ) : null}
      </div>

      <div className="grid w-full min-w-0 max-w-full grid-cols-[6.5rem_minmax(0,1fr)] overflow-hidden rounded-lg border bg-card sm:grid-cols-[8.5rem_minmax(0,1fr)]">
        {/* Sticky label column */}
        <div className="border-r">
          <div style={{ height: HEADER_H }} />
          {rows.map((r) => (
            <div
              key={r.id}
              className="flex items-center truncate px-2 text-xs"
              style={{ height: ROW_H }}
              title={r.label}
            >
              <span className="truncate">{r.label}</span>
            </div>
          ))}
        </div>

        {/* Scrollable chart */}
        <div
          ref={scrollRef}
          className="min-w-0 overflow-x-auto overscroll-x-contain"
        >
          <div
            className={cn("relative select-none", drag && "cursor-grabbing")}
            style={{ width: Math.max(scale.width, 60), height: contentH }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            {/* Month gridlines + labels (labels thinned when too close to fit) */}
            {monthTicks.map((m, i) => (
              <div key={`${m.label}-${i}`}>
                <div
                  className="absolute top-0 bottom-0 w-px bg-border/70"
                  style={{ left: m.x }}
                  aria-hidden
                />
                {m.showLabel ? (
                  <span
                    className="absolute top-1 pl-1 text-[10px] whitespace-nowrap text-muted-foreground"
                    style={{ left: m.x }}
                  >
                    {m.label}
                  </span>
                ) : null}
              </div>
            ))}

            {/* Today */}
            <div
              className="pointer-events-none absolute top-0 bottom-0 z-20 w-px bg-info"
              style={{ left: todayX }}
              aria-hidden
            />

            {/* Row stripes */}
            {rows.map((r, i) => (
              <div
                key={r.id}
                className={cn(
                  "absolute right-0 left-0",
                  i % 2 === 1 && "bg-muted/25"
                )}
                style={{ top: HEADER_H + i * ROW_H, height: ROW_H }}
                aria-hidden
              />
            ))}

            {/* Dependency arrows */}
            <svg
              className="pointer-events-none absolute inset-0 z-10"
              width={Math.max(scale.width, 60)}
              height={contentH}
              aria-hidden
            >
              <defs>
                <marker
                  id="gantt-arrow"
                  viewBox="0 0 8 8"
                  refX="7"
                  refY="4"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M0,0 L8,4 L0,8 z" fill="currentColor" />
                </marker>
              </defs>
              {deps.map((dep) => {
                const from = taskById.get(dep.fromTaskId);
                const to = taskById.get(dep.toTaskId);
                if (!from || !to) return null;
                const fi = rowIndexForTask(from);
                const ti = rowIndexForTask(to);
                const x1 =
                  scale.x(from.dueDate) +
                  shiftFor("task", from.id) +
                  cascadeShift(fi) +
                  5;
                const x2 =
                  scale.x(to.dueDate) +
                  shiftFor("task", to.id) +
                  cascadeShift(ti) -
                  7;
                const y1 = HEADER_H + fi * ROW_H + ROW_H / 2;
                const y2 = HEADER_H + ti * ROW_H + ROW_H / 2;
                const overdue = from.dueDate < today && from.status !== "done";
                const midX = Math.max(x1 + 10, (x1 + x2) / 2);
                return (
                  <path
                    key={`${dep.fromTaskId}-${dep.toTaskId}`}
                    d={`M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`}
                    fill="none"
                    strokeWidth={1.5}
                    markerEnd="url(#gantt-arrow)"
                    className={overdue ? "text-destructive" : "text-muted-foreground/70"}
                    stroke="currentColor"
                    strokeDasharray={overdue ? undefined : "4 3"}
                  />
                );
              })}
            </svg>

            {/* Phase bars */}
            {rows.map((r, i) => {
              const p = r.phase;
              if (!p || (!p.startDate && !p.dueDate)) return null;
              const s = p.startDate ?? p.dueDate!;
              const e = p.dueDate ?? p.startDate!;
              const shift = shiftFor("phase-move", p.id) + cascadeShift(i);
              const left = scale.x(s) + shift;
              const right = scale.x(e) + shift + shiftFor("phase-resize", p.id);
              const width = Math.max(6, right - left);
              return (
                <div
                  key={p.id}
                  className={cn(
                    "absolute z-10 rounded-md opacity-90",
                    canEdit && "cursor-grab active:cursor-grabbing"
                  )}
                  style={{
                    left,
                    width,
                    top: HEADER_H + i * ROW_H + 7,
                    height: ROW_H - 14,
                    background: p.color ?? "var(--chart-1)",
                  }}
                  title={`${p.name}: ${p.startDate ?? "?"} → ${p.dueDate ?? "?"}${canEdit ? " · drag to move" : ""}`}
                  onPointerDown={(e2) =>
                    beginDrag(e2, {
                      kind: "phase-move",
                      id: p.id,
                      startX: e2.clientX,
                      dx: 0,
                    })
                  }
                >
                  {canEdit && p.dueDate ? (
                    <div
                      className="absolute inset-y-0 -right-1 w-2.5 cursor-ew-resize rounded-r-md"
                      title="Drag to change the end date"
                      onPointerDown={(e2) =>
                        beginDrag(e2, {
                          kind: "phase-resize",
                          id: p.id,
                          startX: e2.clientX,
                          dx: 0,
                        })
                      }
                    />
                  ) : null}
                </div>
              );
            })}

            {/* Task / milestone markers */}
            {tasks.map((t) => {
              const i = rowIndexForTask(t);
              const x =
                scale.x(t.dueDate) + shiftFor("task", t.id) + cascadeShift(i);
              const y = HEADER_H + i * ROW_H + ROW_H / 2;
              const tone = taskTone(t, today);
              return (
                <button
                  key={t.id}
                  type="button"
                  className={cn(
                    "absolute z-20 -translate-x-1/2 -translate-y-1/2",
                    canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
                  )}
                  style={{ left: x, top: y }}
                  title={`${t.title} · due ${t.dueDate} · ${t.status.replace("_", " ")}${canEdit ? " · drag to reschedule" : ""}`}
                  onPointerDown={(e2) =>
                    beginDrag(e2, {
                      kind: "task",
                      id: t.id,
                      startX: e2.clientX,
                      dx: 0,
                    })
                  }
                  onClick={() => {
                    if (!didDragRef.current) router.push(tasksHref);
                  }}
                >
                  {t.isMilestone ? (
                    <span
                      className="block size-3 rotate-45 border border-background"
                      style={{ background: tone }}
                    />
                  ) : (
                    <span
                      className="block size-2.5 rounded-full border border-background"
                      style={{ background: tone }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Bars are phases; dots are dated tasks (diamonds = milestones). Arrows show
        task dependencies — red when the predecessor is overdue.
        {canEdit ? " Drag bars or dots to reschedule." : ""}
      </p>
    </div>
  );
}
