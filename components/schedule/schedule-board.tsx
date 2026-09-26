"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { CalendarClock, Minus, Pencil, Plus, RotateCcw, Sparkles, Wand2 } from "lucide-react";

import { autoSchedule, monthlyLoad, type ScheduleInput } from "@/lib/schedule/plan";
import {
  bulkRescheduleProjects,
  updateProjectSchedule,
} from "@/lib/schedule/actions";
import type { DurationByKind } from "@/lib/planning/capacity";
import { groupForKind, type CapacityGroup } from "@/lib/planning/groups";
import { portfolioDeadline } from "@/lib/projects/deadline";
import { addDaysYmd } from "@/lib/timeline/scale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  PROJECT_KIND_LABELS,
  VIDEO_PRODUCTION_MODE_LABELS,
  type ProjectKind,
  type VideoProductionMode,
} from "@/lib/projects/kinds";

type ProjectInput = {
  id: string;
  slug: string;
  title: string;
  kind: string | null;
  videoProductionMode: string | null;
  status: string;
  priority: string;
  healthStatus: string | null;
  startDate: string | null;
  estimatedDurationMonths: number | null;
  dueDate: string | null;
  completeByDate: string | null;
  taskCount: number;
};

type Sched = { start: string | null; duration: number | null };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY = 86_400_000;
// Fixed label-column width so every path's track aligns with the shared axis.
const GRID = "grid grid-cols-[130px_1fr] sm:grid-cols-[210px_1fr]";

function toTime(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}
function monthYear(ymd: string) {
  const [y, m] = ymd.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
function addMonthsYmd(ymd: string, months: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1 + months, d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
function monthsBetween(a: string, b: string) {
  return Math.max(1, Math.round((toTime(b) - toTime(a)) / (DAY * 30.44)));
}

export function ScheduleBoard({
  projects,
  durationByKind,
  groups,
  staffingByPath = {},
  today,
}: {
  projects: ProjectInput[];
  durationByKind: DurationByKind;
  groups: CapacityGroup[];
  /** Per-path staffing bottleneck: the concurrency the team can actually staff. */
  staffingByPath?: Record<string, { suggested: number; role: string | null }>;
  today: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Per-path "how many at once" — seeded from Settings ▸ Planning capacity.
  const [concurrencyByGroup, setConcurrencyByGroup] = useState<Record<string, number>>(() =>
    Object.fromEntries(groups.map((g) => [g.key, g.concurrency]))
  );
  const [sched, setSched] = useState<Record<string, Sched>>(() =>
    Object.fromEntries(
      projects.map((p) => [p.id, { start: p.startDate, duration: p.estimatedDurationMonths }])
    )
  );
  const [preview, setPreview] = useState<Record<string, Sched> | null>(null);
  // Which path's auto-schedule is under review (null = none).
  const [previewGroup, setPreviewGroup] = useState<string | null>(null);
  const [pendingShift, setPendingShift] = useState<{
    id: string;
    title: string;
    newStart: string;
    delta: number;
    taskCount: number;
  } | null>(null);

  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    id: string;
    mode: "move" | "resize";
    startX: number;
    origStart: string;
    origDuration: number;
    trackW: number;
    spanDays: number;
    delta: number;
  } | null>(null);

  const active = preview ?? sched;
  // Untyped projects are treated as books (the primary kind).
  const kindDur = (kind: string | null) => durationByKind[(kind ?? "book") as keyof DurationByKind] ?? durationByKind.book;
  const durOf = (p: ProjectInput) => active[p.id]?.duration ?? kindDur(p.kind);
  const deadlineOf = portfolioDeadline;
  const committedStart = (p: ProjectInput) => active[p.id]?.start ?? null;
  // Effective start: a set start, else back-scheduled from the deadline
  // (start = due − duration) so the bar ends *on the due date*. A book planned
  // this way with no explicit start is "provisional" until one is set.
  const startOf = (p: ProjectInput) => {
    const set = committedStart(p);
    if (set) return set;
    const dl = deadlineOf(p);
    return dl ? addMonthsYmd(dl, -durOf(p)) : null;
  };
  const isProvisional = (p: ProjectInput) => !preview && !committedStart(p) && !!deadlineOf(p);
  const endOf = (p: ProjectInput) => {
    const s = startOf(p);
    return s ? addMonthsYmd(s, durOf(p)) : null;
  };
  // Overdue (red): the due date has already passed, or the planned finish lands
  // after the due date. A back-scheduled book ends on its due date, so it's red
  // only once that date is in the past.
  const overdueOf = (p: ProjectInput) => {
    const dl = deadlineOf(p);
    if (!dl) return false;
    if (dl < today) return true;
    const e = endOf(p);
    return !!(e && e > dl);
  };

  // --- assign each project to exactly one work path, soonest-due first ---
  const grouped = useMemo(() => {
    const byKey = new Map<string, ProjectInput[]>(groups.map((g) => [g.key, []]));
    for (const p of projects) {
      const g = groupForKind(groups, p.kind) ?? groups[0];
      (byKey.get(g?.key ?? "") ?? byKey.get(groups[0]?.key ?? ""))?.push(p);
    }
    for (const list of byKey.values()) {
      list.sort((a, b) => {
        const da = portfolioDeadline(a);
        const db = portfolioDeadline(b);
        if (da && db) return da < db ? -1 : da > db ? 1 : a.title.localeCompare(b.title);
        if (da) return -1; // dated books first, undated last
        if (db) return 1;
        return a.title.localeCompare(b.title);
      });
    }
    return groups.map((g) => ({ group: g, projects: byKey.get(g.key) ?? [] }));
  }, [groups, projects]);

  // --- axis range across all dates (shared by every path) ---
  const { minT, maxT, spanMs } = useMemo(() => {
    const times = [toTime(today)];
    for (const p of projects) {
      const s = startOf(p);
      const e = endOf(p);
      const dl = deadlineOf(p);
      if (s) times.push(toTime(s));
      if (e) times.push(toTime(e));
      if (dl) times.push(toTime(dl));
    }
    const lo = Math.min(...times) - 30 * DAY;
    const hi = Math.max(...times) + 45 * DAY;
    return { minT: lo, maxT: hi, spanMs: Math.max(hi - lo, DAY) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, active, today]);
  const pos = (ymd: string) => ((toTime(ymd) - minT) / spanMs) * 100;
  const spanDays = spanMs / DAY;
  const minYmd = new Date(minT).toISOString().slice(0, 10);
  const maxYmd = new Date(maxT).toISOString().slice(0, 10);
  const todayLeft = pos(today);

  // month axis marks (shared)
  const marks: { left: number; label: string }[] = [];
  {
    let m = new Date(new Date(minT).getFullYear(), new Date(minT).getMonth(), 1);
    const step = spanDays > 5 * 365 ? 12 : 6;
    while (m.getTime() <= maxT) {
      const ymd = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}-01`;
      marks.push({ left: pos(ymd), label: monthYear(ymd) });
      m = new Date(m.getFullYear(), m.getMonth() + step, 1);
    }
  }

  // --- persistence ---
  function persist(id: string, patch: { startDate?: string; estimatedDurationMonths?: number | null; shiftTasksByDays?: number }) {
    startTransition(async () => {
      const res = await updateProjectSchedule(id, patch);
      if (!res.ok) {
        toast.error(res.error.message);
        router.refresh();
      }
    });
  }

  function commitMove(p: ProjectInput, newStart: string, delta: number) {
    setSched((s) => ({ ...s, [p.id]: { ...s[p.id], start: newStart } }));
    if (p.taskCount > 0 && delta !== 0) {
      setPendingShift({ id: p.id, title: p.title, newStart, delta, taskCount: p.taskCount });
    } else {
      persist(p.id, { startDate: newStart });
    }
  }

  // --- drag ---
  function onPointerDown(e: React.PointerEvent, p: ProjectInput, mode: "move" | "resize") {
    if (preview) return; // don't drag while reviewing an auto-schedule preview
    const s = startOf(p);
    if (!s) return;
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      id: p.id,
      mode,
      startX: e.clientX,
      origStart: s,
      origDuration: durOf(p),
      trackW: rect.width,
      spanDays,
      delta: 0,
    };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const dxDays = Math.round(((e.clientX - d.startX) / d.trackW) * d.spanDays);
    if (dxDays === d.delta) return;
    d.delta = dxDays;
    setSched((s) => {
      if (d.mode === "move") {
        return { ...s, [d.id]: { ...s[d.id], start: addDaysYmd(d.origStart, dxDays) } };
      }
      const newEnd = addDaysYmd(addMonthsYmd(d.origStart, d.origDuration), dxDays);
      return { ...s, [d.id]: { ...s[d.id], duration: monthsBetween(d.origStart, newEnd) } };
    });
  }
  function onPointerUp() {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || d.delta === 0) return;
    const p = projects.find((x) => x.id === d.id);
    if (!p) return;
    if (d.mode === "move") {
      commitMove(p, addDaysYmd(d.origStart, d.delta), d.delta);
    } else {
      persist(p.id, { estimatedDurationMonths: monthsBetween(d.origStart, addDaysYmd(addMonthsYmd(d.origStart, d.origDuration), d.delta)) });
    }
  }

  // --- auto-schedule, scoped to one path ---
  function runAutoSchedule(groupProjects: ProjectInput[], groupKey: string, concurrency: number) {
    const input: ScheduleInput[] = groupProjects.map((p) => ({
      id: p.id,
      deadline: deadlineOf(p),
      kind: p.kind,
      estimatedDurationMonths: active[p.id]?.duration ?? null,
    }));
    const result = autoSchedule(input, concurrency, today, durationByKind);
    const next: Record<string, Sched> = { ...sched };
    for (const r of result) next[r.id] = { start: r.start, duration: active[r.id]?.duration ?? null };
    setPreview(next);
    setPreviewGroup(groupKey);
  }
  function discardPreview() {
    setPreview(null);
    setPreviewGroup(null);
  }
  function savePreview(groupProjects: ProjectInput[]) {
    if (!preview) return;
    const assignments = groupProjects
      .filter((p) => preview[p.id]?.start)
      .map((p) => ({
        id: p.id,
        startDate: preview[p.id].start as string,
        estimatedDurationMonths: preview[p.id].duration ?? undefined,
      }));
    startTransition(async () => {
      const res = await bulkRescheduleProjects(assignments);
      if (res.ok) {
        setSched((s) => {
          const merged = { ...s };
          for (const p of groupProjects) if (preview[p.id]) merged[p.id] = preview[p.id];
          return merged;
        });
        discardPreview();
        toast.success(`Scheduled ${res.data?.updated ?? assignments.length} projects`);
        router.refresh();
      } else {
        toast.error(res.error.message);
      }
    });
  }

  const healthColor = (h: string | null) =>
    h === "red" ? "var(--destructive)" : h === "amber" ? "var(--warning)" : "var(--success)";

  // Attach the drag-measuring ref to the first rendered track (all tracks share
  // the same pixel width, so any one works for the drag math).
  const firstTrackId = grouped.find((g) => g.projects.length > 0)?.projects[0]?.id ?? null;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Each work path runs in parallel with its own capacity. A path&apos;s
        &ldquo;at once&rdquo; comes from Settings; where staffing is set up, a
        suggestion shows the number your people can actually cover — see{" "}
        <b>Team capacity</b>.
      </p>

      {grouped.map(({ group, projects: gp }) => {
        const concurrency = concurrencyByGroup[group.key] ?? group.concurrency;
        const staffing = staffingByPath[group.key];
        const underReview = previewGroup === group.key;
        const otherReview = preview !== null && !underReview;

        // per-path load ribbon (aligned to the shared month axis)
        const scheduled = gp
          .map((p) => ({ start: startOf(p), end: endOf(p) }))
          .filter((iv): iv is { start: string; end: string } => !!iv.start && !!iv.end);
        const load = monthlyLoad(scheduled, minYmd, maxYmd);
        const maxLoad = Math.max(...load.map((l) => l.count), concurrency, 1);
        const peakLoad = Math.max(...load.map((l) => l.count), 0);
        const assessed = gp.filter(p => !!deadlineOf(p) && !!startOf(p) && !!endOf(p));
        const missingDates = gp.length - assessed.length;
        const lateCount = assessed.filter((p) => overdueOf(p)).length;

        return (
          <div key={group.key} className="overflow-hidden rounded-xl border bg-card">
            {/* path header + toolbar */}
            <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2">
              <span className="size-2.5 shrink-0 rounded-[3px] bg-primary" />
              <h3 className="font-heading text-sm font-semibold">{group.name}</h3>
              <span className="hidden text-xs text-muted-foreground lg:inline">
                {group.kinds.map((kind) => PROJECT_KIND_LABELS[kind]).join(" · ")}
              </span>
              <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Button size="icon-xs" variant="outline" aria-label="Fewer at once" disabled={preview !== null} onClick={() => setConcurrencyByGroup((c) => ({ ...c, [group.key]: Math.max(1, (c[group.key] ?? group.concurrency) - 1) }))}>
                    <Minus />
                  </Button>
                  <span className="min-w-6 text-center font-semibold tabular-nums text-foreground" aria-live="polite">{concurrency}</span>
                  <Button size="icon-xs" variant="outline" aria-label="More at once" disabled={preview !== null} onClick={() => setConcurrencyByGroup((c) => ({ ...c, [group.key]: Math.min(12, (c[group.key] ?? group.concurrency) + 1) }))}>
                    <Plus />
                  </Button>
                </span>
                at once
              </span>
              {staffing && staffing.suggested > 0 && staffing.suggested !== concurrency && !preview ? (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setConcurrencyByGroup((c) => ({ ...c, [group.key]: staffing.suggested }))}
                  title="Set to the concurrency your staffing can cover on this path"
                >
                  Staffing supports <b className="tabular-nums text-foreground">{staffing.suggested}</b>
                  {staffing.role ? <> (limited by {staffing.role})</> : null} · <span className="text-primary">use it</span>
                </button>
              ) : concurrency !== group.concurrency && !preview ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setConcurrencyByGroup((c) => ({ ...c, [group.key]: group.concurrency }))}
                  title="Reset to the value configured in Settings"
                >
                  <RotateCcw className="size-3" /> Configured <b className="tabular-nums text-foreground">{group.concurrency}</b>
                </button>
              ) : null}
              <div className="flex-1" />
              {underReview ? (
                <>
                  <span className="text-sm text-muted-foreground">Reviewing an auto-schedule.</span>
                  <Button size="sm" variant="ghost" disabled={pending} onClick={discardPreview}>Discard</Button>
                  <Button size="sm" disabled={pending} onClick={() => savePreview(gp)}>{pending ? "Saving…" : "Save schedule"}</Button>
                </>
              ) : (
                <Button size="sm" variant="outline" disabled={otherReview || gp.length === 0} onClick={() => runAutoSchedule(gp, group.key, concurrency)}>
                  <Wand2 /> Auto-schedule
                </Button>
              )}
            </div>

            {gp.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                No projects in this path yet.
              </p>
            ) : (
              <>
                {/* per-path banner */}
                <div className="px-3 pt-2">
                  <p className="mb-2 text-sm text-muted-foreground">{assessed.length} of {gp.length} projects assessed.{missingDates > 0 ? ` ${missingDates} need dates before deadline health can be assessed.` : ""}</p>
                  {assessed.length === 0 ? <p className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">Add project dates to assess whether deadlines are achievable.</p> : lateCount > 0 ? (
                    <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-1.5 text-sm">
                      <CalendarClock className="size-4 shrink-0 text-destructive" />
                      <span>
                        <b className="tabular-nums">{lateCount}</b> project{lateCount === 1 ? "" : "s"}{" "}can&apos;t meet their due date
                        {peakLoad > concurrency ? (
                          <> — meeting them all would need up to <b className="tabular-nums">{peakLoad}</b> at once, but this path does <b className="tabular-nums">{concurrency}</b></>
                        ) : null}
                        . Extend a deadline, add capacity, or reprioritize.
                      </span>
                    </div>
                  ) : peakLoad > concurrency ? (
                    <div className="flex items-center gap-2 rounded-lg border border-warning/50 bg-warning/10 px-3 py-1.5 text-sm">
                      <Sparkles className="size-4 shrink-0 text-warning" />
                      <span>
                        Assessed projects can still hit their dates, but up to <b className="tabular-nums">{peakLoad}</b> would run at once vs. <b className="tabular-nums">{concurrency}</b> capacity — it&apos;ll be tight.
                      </span>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-success/40 bg-success/5 px-3 py-1.5 text-sm text-success">
                      The {assessed.length} assessed projects can meet their due dates within {concurrency} at a time.
                    </div>
                  )}
                </div>

                <div className={cn(GRID, "px-3 pb-2 pt-2")}>
                  {/* load ribbon */}
                  <div className="flex items-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Path load
                  </div>
                  <div className="relative flex h-12 items-end">
                    <div className="absolute inset-y-0 z-10 border-l-2 border-foreground/30" style={{ left: `${todayLeft}%` }} />
                    <div className="absolute right-0 left-0 border-t border-dashed border-primary/70" style={{ bottom: `${(concurrency / maxLoad) * 100}%` }} />
                    <span className="absolute right-1 z-10 -translate-y-1/2 bg-card px-1 text-[10px] font-medium text-primary" style={{ bottom: `${(concurrency / maxLoad) * 100}%` }}>
                      {concurrency} slots
                    </span>
                    {load.map((l, i) => (
                      <div
                        key={i}
                        className={cn("mx-px flex-1 rounded-t-sm", l.count > concurrency ? "bg-destructive/70" : "bg-success/55")}
                        style={{ height: `${Math.round((l.count / maxLoad) * 100)}%` }}
                        title={`${l.count} running`}
                      />
                    ))}
                  </div>

                  {/* project rows */}
                  {gp.map((p) => {
                    const s = startOf(p);
                    const e = endOf(p);
                    const dl = deadlineOf(p);
                    const provisional = isProvisional(p);
                    const late = overdueOf(p);
                    return (
                      <div key={p.id} className="contents">
                        <div className="flex items-center gap-2 border-t px-0 py-2 text-sm">
                          <span className="mt-0.5 size-2 shrink-0 self-start rounded-full" style={{ background: healthColor(p.healthStatus) }} />
                          <div className="min-w-0 flex-1">
                            <Link href={`/projects/${p.slug}`} className="block truncate hover:underline">
                              {p.title}
                            </Link>
                            <span className={cn("block text-[11px] tabular-nums", late ? "text-destructive" : "text-muted-foreground")}>
                              {p.kind ? PROJECT_KIND_LABELS[p.kind as ProjectKind] : "Project"}
                              {p.kind === "video_series"
                                ? ` · ${VIDEO_PRODUCTION_MODE_LABELS[(p.videoProductionMode ?? "original") as VideoProductionMode]}`
                                : ""}
                              {dl ? <> · due {monthYear(dl)}{late ? " · overdue" : ""}</> : " · no due date"}
                            </span>
                          </div>
                          <EditPopover
                            project={p}
                            start={s}
                            isProvisional={provisional}
                            duration={durOf(p)}
                            deadline={dl}
                            plannedEnd={e}
                            onSave={(startDate, duration) => {
                              setSched((st) => ({ ...st, [p.id]: { start: startDate, duration } }));
                              persist(p.id, { startDate: startDate ?? undefined, estimatedDurationMonths: duration });
                            }}
                          />
                        </div>
                        <div
                          ref={p.id === firstTrackId ? trackRef : undefined}
                          className="relative min-h-10 border-t"
                          onPointerMove={onPointerMove}
                          onPointerUp={onPointerUp}
                        >
                          <div className="pointer-events-none absolute inset-y-0 z-10 border-l-2 border-foreground/25" style={{ left: `${todayLeft}%` }} />
                          {s && e ? (
                            <div
                              className={cn(
                                "group absolute top-2 flex h-6 items-center rounded-md text-[11px] select-none",
                                preview ? "cursor-default" : "cursor-grab active:cursor-grabbing",
                                provisional
                                  ? late
                                    ? "border border-dashed border-destructive/60 bg-destructive/8 text-destructive italic"
                                    : "border border-dashed border-primary/60 bg-primary/5 text-muted-foreground italic"
                                  : late
                                    ? "bg-destructive/12 text-destructive"
                                    : "bg-success/15 text-foreground"
                              )}
                              style={{
                                left: `${pos(s)}%`,
                                width: `${Math.max(pos(e) - pos(s), 3)}%`,
                                ...(provisional ? {} : { boxShadow: `inset 3px 0 0 ${late ? "var(--destructive)" : "var(--success)"}` }),
                              }}
                              title={
                                provisional && dl
                                  ? `Planned to end on its ${monthYear(dl)} due date.${late ? " Overdue — the start it needs is already in the past, so it can't be met as-is." : ""} Drag or edit to set a real start.`
                                  : late && dl
                                    ? `Finishes ${monthYear(e as string)}, after its ${monthYear(dl)} deadline.`
                                    : undefined
                              }
                              onPointerDown={(ev) => onPointerDown(ev, p, "move")}
                            >
                              <span className="truncate px-2">{provisional ? "Plan " : ""}{monthYear(s)} → {monthYear(e)}</span>
                              {!preview ? (
                                <span
                                  className="absolute right-0 top-0 h-full w-2 cursor-ew-resize rounded-r-md opacity-0 group-hover:opacity-100"
                                  style={{ boxShadow: `inset -2px 0 0 ${late ? "var(--destructive)" : provisional ? "var(--primary)" : "var(--success)"}` }}
                                  onPointerDown={(ev) => onPointerDown(ev, p, "resize")}
                                  aria-hidden
                                />
                              ) : null}
                            </div>
                          ) : (
                            <div className="absolute top-2.5 left-2 text-xs text-muted-foreground">Not scheduled — no start or due date</div>
                          )}
                          {dl ? (
                            <div
                              className={cn("pointer-events-none absolute top-1 h-8 border-l-2", late ? "border-destructive border-dotted" : "border-muted-foreground/70 border-dotted")}
                              style={{ left: `${pos(dl)}%` }}
                              title={`Deadline ${monthYear(dl)}`}
                            />
                          ) : null}
                        </div>
                      </div>
                    );
                  })}

                  {/* per-path axis (aligned across paths) */}
                  <div />
                  <div className="relative h-6 border-t">
                    <span className="absolute top-1 z-10 -translate-x-1/2 rounded bg-muted px-1 text-[10px] font-semibold uppercase text-muted-foreground" style={{ left: `${todayLeft}%` }}>
                      Today
                    </span>
                    {marks.map((mk, i) => (
                      <span key={i} className="absolute top-1 -translate-x-1/2 text-[11px] tabular-nums text-muted-foreground" style={{ left: `${Math.min(97, Math.max(3, mk.left))}%` }}>
                        {mk.label}
                      </span>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        );
      })}

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-success/40" /> Can meet its due date</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-destructive/40" /> Overdue / will miss it</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm border border-dashed border-primary/60 bg-primary/5" /> Planned back from the due date (no start set)</span>
        <span className="inline-flex items-center gap-1.5">◆ Contractual deadline</span>
        <span>A project with no start is planned backward from its due date so the bar ends on the deadline; it turns red when the start it needs is already past. Drag a bar or its right edge, or edit it, to set your own start/duration — it stays red or green based on whether it still meets the due date. Each work path runs in parallel with its own capacity.</span>
      </div>

      {/* shift-tasks confirmation */}
      <Dialog open={pendingShift !== null} onOpenChange={(o) => { if (!o) setPendingShift(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Shift this project&apos;s work too?</DialogTitle>
            <DialogDescription>
              {pendingShift
                ? `You moved "${pendingShift.title}" by ${Math.abs(pendingShift.delta)} day${Math.abs(pendingShift.delta) === 1 ? "" : "s"}. Move its ${pendingShift.taskCount} task${pendingShift.taskCount === 1 ? "" : "s"} and phase dates by the same amount? Tasks with manually set due dates aren't touched.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose
              render={<Button variant="outline" />}
              onClick={() => { if (pendingShift) persist(pendingShift.id, { startDate: pendingShift.newStart }); }}
            >
              Just the project
            </DialogClose>
            <Button
              onClick={() => {
                if (pendingShift) persist(pendingShift.id, { startDate: pendingShift.newStart, shiftTasksByDays: pendingShift.delta });
                setPendingShift(null);
              }}
            >
              Shift tasks too
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EditPopover({
  project,
  start,
  isProvisional = false,
  duration,
  deadline,
  plannedEnd,
  onSave,
}: {
  project: ProjectInput;
  start: string | null;
  isProvisional?: boolean;
  duration: number;
  deadline: string | null;
  plannedEnd: string | null;
  onSave: (startDate: string | null, duration: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [startVal, setStartVal] = useState(start ?? "");
  const [durVal, setDurVal] = useState(String(project.estimatedDurationMonths ?? duration));

  function save() {
    onSave(startVal || null, durVal ? Math.max(1, Math.min(120, Number(durVal))) : null);
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setStartVal(start ?? "");
          setDurVal(String(project.estimatedDurationMonths ?? duration));
        }
      }}
    >
      <PopoverTrigger render={<Button size="icon-xs" variant="ghost" aria-label={`Edit schedule for ${project.title}`} />}>
        <Pencil />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor={`start-${project.id}`}>Start date</Label>
          <Input id={`start-${project.id}`} type="date" value={startVal} onChange={(e) => setStartVal(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`dur-${project.id}`}>Estimated duration (months)</Label>
          <Input id={`dur-${project.id}`} type="number" min={1} max={120} value={durVal} onChange={(e) => setDurVal(e.target.value)} placeholder={String(duration)} />
        </div>
        <p className="text-xs text-muted-foreground">
          {isProvisional ? (
            <>Provisional forward-scheduled start — <b>Save</b> to confirm it. </>
          ) : null}
          {plannedEnd ? <>Planned finish <b>{monthYear(plannedEnd)}</b>. </> : null}
          {deadline ? <>Deadline {monthYear(deadline)}.</> : "No deadline set."}
        </p>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" onClick={save}>Save</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
