"use client";

import { useState } from "react";
import {
  CalendarClock,
  ChevronDown,
  Loader2,
  Minus,
  Plus,
  TrendingUp,
} from "lucide-react";

import { nextSlotCompletion } from "@/lib/schedule/plan";
import { addMonths } from "@/lib/planning/capacity";
import {
  getCompletionPlanningData,
  type CompletionPlanningData,
} from "@/lib/planning/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function ymdParts(ymd: string): [number, number, number] {
  const [y, m, d] = ymd.split("-").map(Number);
  return [y, m, d];
}
function monthYear(ymd: string) {
  const [y, m] = ymdParts(ymd);
  return `${MONTHS[m - 1]} ${y}`;
}
function monthYearLong(ymd: string) {
  const [y, m] = ymdParts(ymd);
  return `${MONTHS_LONG[m - 1]} ${y}`;
}
function toTime(ymd: string) {
  const [y, m, d] = ymdParts(ymd);
  return new Date(y, m - 1, d).getTime();
}

function Stepper({
  value,
  min,
  max,
  onChange,
  label,
  labelLess,
  labelMore,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  label: string;
  labelLess: string;
  labelMore: string;
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <Button type="button" size="icon-sm" variant="outline" aria-label={labelLess} onClick={() => onChange(clamp(value - 1))}>
        <Minus />
      </Button>
      <span
        className="min-w-9 text-center text-sm font-semibold tabular-nums"
        aria-live="polite"
        aria-atomic="true"
      >
        {value}
      </span>
      <Button type="button" size="icon-sm" variant="outline" aria-label={labelMore} onClick={() => onChange(clamp(value + 1))}>
        <Plus />
      </Button>
    </div>
  );
}

function kindNoun(kind: string | null): string {
  // Untyped projects are treated as books (the primary kind).
  if (kind === "book" || kind == null) return "books";
  if (kind === "article") return "article collections";
  if (kind === "podcast") return "podcast series";
  if (kind === "video_series") return "video series";
  return "projects";
}

/**
 * Suggests a realistic completion date for a *new* project, aligned with the
 * due-date view on the Schedule: the new book starts when a book currently in
 * production frees a slot (or now, if one is free) and takes its typical
 * duration — a near-term date, not a queue years out. The path's real
 * over-commitment (books already past due) is surfaced as honest context.
 */
export function CompletionDatePlanner({
  projectId,
  onPick,
}: {
  projectId: string;
  onPick: (isoDate: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [data, setData] = useState<CompletionPlanningData | null>(null);
  const [concurrency, setConcurrency] = useState(3);
  const [duration, setDuration] = useState(18);

  async function load() {
    setLoading(true);
    setError(false);
    try {
      const d = await getCompletionPlanningData(projectId);
      if (d) {
        setData(d);
        setConcurrency(d.concurrency);
        setDuration(d.durationMonths);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next && !data && !loading) void load();
  }

  const view = data ? computeView(data, concurrency, duration) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button size="sm" variant="outline" className="shrink-0" />}>
        <CalendarClock /> Suggest a date
      </DialogTrigger>
      <DialogContent className="flex max-h-[88dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        {/* Pinned header: title + answer + assumptions stay visible while the
            workload scrolls. */}
        <div className="shrink-0 space-y-3 border-b px-5 pb-4 pt-5">
          <DialogHeader>
            <DialogTitle>Plan a completion date</DialogTitle>
            <DialogDescription>
              A realistic date for a new project, given what&apos;s in production
              and the deadlines already on this path. Adjust the assumptions, then
              use it.
            </DialogDescription>
          </DialogHeader>

          {data && view ? (
            <>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Suggested completion
                </p>
                <p className="font-heading text-2xl font-semibold tabular-nums">
                  {monthYearLong(view.completion)}
                </p>
                <p className="mt-1 text-sm text-pretty">
                  {view.openNow ? (
                    <>A slot is open now — start it now, + <b>{duration} months</b> → {monthYear(view.completion)}.</>
                  ) : (
                    <>
                      <b className="tabular-nums">{view.runningCount}</b>{" "}
                      {kindNoun(data.projectKind)} are in production ({concurrency}{" "}
                      slots); the next frees up <b>{monthYear(view.slotOpen)}</b>, +{" "}
                      {duration} months → completion.
                    </>
                  )}
                </p>
                {view.overdueCount > 0 ? (
                  <p className="mt-1.5 text-sm text-warning text-pretty">
                    Reality check: the <b>{data.groupName}</b> path already has{" "}
                    <b className="tabular-nums">{view.overdueCount}</b>{" "}
                    {kindNoun(data.projectKind)} past their due date. This date
                    assumes the new one takes the next open slot — you&apos;d be
                    prioritizing it over work that&apos;s already behind.
                  </p>
                ) : null}
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2">
                  <div className="text-sm leading-tight">
                    Projects at once
                    <span className="block text-xs text-muted-foreground">In the {data.groupName} path</span>
                  </div>
                  <Stepper value={concurrency} min={1} max={12} onChange={setConcurrency} label="Projects at once" labelLess="Fewer concurrent projects" labelMore="More concurrent projects" />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2">
                  <div className="text-sm leading-tight">
                    Typical duration
                    <span className="block text-xs text-muted-foreground">Months, start to finish</span>
                  </div>
                  <Stepper value={duration} min={1} max={60} onChange={setDuration} label="Typical duration in months" labelLess="Shorter duration" labelMore="Longer duration" />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Only books on the <b>{data.groupName}</b> path compete for its
                slots. Changes here only affect this estimate; set the defaults in
                Settings ▸ Workspace ▸ Planning capacity.
              </p>
            </>
          ) : null}
        </div>

        {/* Scrollable workload */}
        {loading ? (
          <div className="flex flex-1 items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Reading the current workload…
          </div>
        ) : error || !data || !view ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-12 text-center text-sm text-muted-foreground">
            <p>Couldn&apos;t read the current workload.</p>
            <Button size="sm" variant="outline" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <PathDeadlines
              books={data.books}
              today={data.today}
              groupName={data.groupName}
              overdueCount={view.overdueCount}
            />

            {data.dormantCount > 0 ? (
              <p className="rounded-lg border border-dashed bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                <b className="text-foreground tabular-nums">{data.dormantCount}</b>{" "}
                more {kindNoun(data.projectKind)}{" "}on this path have no due date
                yet, so they aren&apos;t shown here.
              </p>
            ) : null}

            {data.historical ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed bg-muted/20 px-3 py-2.5 text-sm text-muted-foreground">
                <TrendingUp className="size-4 shrink-0" />
                <span>
                  Your last <b className="text-foreground">{data.historical.count}</b> completed{" "}
                  {kindNoun(data.projectKind)} averaged{" "}
                  <b className="text-foreground">{data.historical.avgMonths} months</b>.
                </span>
                {data.historical.avgMonths !== duration ? (
                  <Button type="button" size="xs" variant="ghost" className="ml-auto text-primary" onClick={() => setDuration(data.historical!.avgMonths)}>
                    Use {data.historical.avgMonths}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        )}

        {/* Pinned footer */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t bg-muted/40 px-5 py-3">
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button
            disabled={!view}
            onClick={() => {
              if (view) {
                onPick(view.completion);
                setOpen(false);
              }
            }}
          >
            Use this date
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function computeView(data: CompletionPlanningData, concurrency: number, duration: number) {
  const kdur = (kind: string | null) =>
    data.durationByKind[(kind ?? "book") as keyof typeof data.durationByKind] ?? data.durationByKind.book;
  const runningFinishes = data.books
    .filter((b) => b.startDate)
    .map((b) => addMonths(b.startDate as string, b.estimatedDurationMonths ?? kdur(b.kind)));
  const slot = nextSlotCompletion(runningFinishes, concurrency, duration, data.today);
  const overdueCount = data.books.filter((b) => b.deadline && b.deadline < data.today).length;
  return { ...slot, overdueCount };
}

/**
 * The committed books on this path, in due-date order, with overdue ones (due
 * date already passed) flagged red — the same reality the Schedule roadmap shows.
 */
function PathDeadlines({
  books,
  today,
  groupName,
  overdueCount,
}: {
  books: CompletionPlanningData["books"];
  today: string;
  groupName: string;
  overdueCount: number;
}) {
  const [openList, setOpenList] = useState(books.length <= 8);
  const dated = books.filter((b) => b.deadline);
  const rows = [...dated].sort((a, b) => toTime(a.deadline as string) - toTime(b.deadline as string));

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border bg-muted/20 px-3 py-2.5 text-sm text-muted-foreground">
        No other dated {kindNoun(null)} on the {groupName} path yet.
      </p>
    );
  }

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm font-medium"
        onClick={() => setOpenList((v) => !v)}
        aria-expanded={openList}
      >
        <span>
          On the {groupName} path ({rows.length})
          {overdueCount > 0 ? <span className="ml-2 font-normal text-destructive">{overdueCount} overdue</span> : null}
        </span>
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", openList && "rotate-180")} />
      </button>
      {openList ? (
        <ul className="max-h-56 divide-y overflow-y-auto border-t">
          {rows.map((b, i) => {
            const overdue = (b.deadline as string) < today;
            return (
              <li key={i} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                <span className={cn("size-2 shrink-0 rounded-full", overdue ? "bg-destructive" : "bg-success/70")} />
                <span className="min-w-0 flex-1 truncate">{b.name}</span>
                {overdue ? <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-destructive">overdue</span> : null}
                <span className={cn("shrink-0 text-xs tabular-nums", overdue ? "text-destructive" : "text-muted-foreground")}>
                  due {monthYear(b.deadline as string)}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
