"use client";

import { confirmDialog } from "@/lib/dialog-requests";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Play, Square, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import {
  deleteTimeEntry,
  loadTaskTime,
  logTime,
  startTimer,
  stopTimer,
} from "@/lib/tasks/time-actions";
import type { TimeEntryRow } from "@/lib/tasks/time-queries";
import { estimateVsActual, formatDuration } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useActiveTimer } from "@/components/time/active-timer-provider";

function fmtHours(h: number): string {
  return `${Math.round(h * 10) / 10}h`;
}

type Loaded = { entries: TimeEntryRow[]; totalSeconds: number };

/** Time-tracking section for the task detail dialog: start/stop, estimate vs actual,
 *  entries, and manual logging. Degrades to "No time logged yet" with no entries. */
export function TaskTimeSection({
  taskId,
  taskTitle,
  estimateHours,
  currentUserId,
  className = "border-t pt-3",
}: {
  taskId: string;
  taskTitle: string;
  estimateHours: string | null;
  currentUserId: string;
  className?: string;
}) {
  const router = useRouter();
  const { activeTimer, setActiveTimer } = useActiveTimer();
  const [data, setData] = useState<Loaded | null>(null);
  const [busy, start] = useTransition();
  const [minutes, setMinutes] = useState("");
  const [note, setNote] = useState("");

  const refetch = () =>
    loadTaskTime(taskId)
      .then(setData)
      .catch(() => setData({ entries: [], totalSeconds: 0 }));

  useEffect(() => {
    // Reset + reload whenever the dialog switches tasks.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(null);
    void refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  const appearsRunning = activeTimer?.taskId === taskId;
  const est = estimateHours ? Number(estimateHours) : null;
  const eva = estimateVsActual(est, data?.totalSeconds ?? 0);

  const toggle = () => {
    const previous = activeTimer;
    setActiveTimer(
      appearsRunning
        ? null
        : {
            entryId: `pending-${crypto.randomUUID()}`,
            taskId,
            taskTitle,
            projectSlug: null,
            startedAt: new Date().toISOString(),
          }
    );
    start(async () => {
      try {
        if (appearsRunning) await stopTimer();
        else await startTimer(taskId);
        await refetch();
        router.refresh();
      } catch {
        setActiveTimer(previous);
        toast.error("Timer action failed");
      }
    });
  };

  const add = () => {
    const m = Math.round(Number(minutes));
    if (!m || m <= 0) return;
    const previous = data;
    const optimisticEntry: TimeEntryRow = {
      id: `pending-${crypto.randomUUID()}`,
      userId: currentUserId,
      userName: "You",
      startedAt: new Date(Date.now() - m * 60_000).toISOString(),
      endedAt: new Date().toISOString(),
      durationSeconds: m * 60,
      source: "manual",
      note: note.trim() || null,
    };
    setData((current) => ({
      entries: [optimisticEntry, ...(current?.entries ?? [])],
      totalSeconds: (current?.totalSeconds ?? 0) + m * 60,
    }));
    const previousMinutes = minutes;
    const previousNote = note;
    setMinutes("");
    setNote("");
    start(async () => {
      try {
        await logTime({ taskId, minutes: m, note: note.trim() || undefined });
        await refetch();
        router.refresh();
      } catch {
        setData(previous);
        setMinutes(previousMinutes);
        setNote(previousNote);
        toast.error("Couldn't log time");
      }
    });
  };

  const remove = async (entry: TimeEntryRow) => {
    if (!(await confirmDialog("Delete this time entry? This cannot be undone."))) return;
    const previous = data;
    setData((current) =>
      current
        ? {
            entries: current.entries.filter((item) => item.id !== entry.id),
            totalSeconds: Math.max(
              0,
              current.totalSeconds - (entry.durationSeconds ?? 0)
            ),
          }
        : current
    );
    start(async () => {
      try {
        await deleteTimeEntry(entry.id);
        router.refresh();
      } catch {
        setData(previous);
        toast.error("Couldn't delete entry");
      }
    });
  };

  return (
    <div className={cn("grid gap-2", className)}>
      <div className="flex items-center justify-between">
        <Label>Time tracking</Label>
        <Button
          size="sm"
          variant={appearsRunning ? "destructive" : "default"}
          disabled={busy}
          onClick={toggle}
        >
          {appearsRunning ? (
            <>
              <Square className="size-3.5 fill-current" /> Stop
            </>
          ) : (
            <>
              <Play className="size-3.5" /> Start
            </>
          )}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="text-muted-foreground">
          Tracked{" "}
          <span className="font-medium tabular-nums text-foreground">
            {fmtHours(eva.actualHours)}
          </span>
        </span>
        {eva.estimateHours !== null ? (
          <span className="text-muted-foreground">
            Estimate{" "}
            <span className="font-medium tabular-nums text-foreground">
              {fmtHours(eva.estimateHours)}
            </span>
          </span>
        ) : null}
        {eva.varianceHours !== null ? (
          <span
            className={cn(
              "tabular-nums",
              eva.over ? "text-destructive" : "text-success"
            )}
          >
            {eva.over ? "+" : ""}
            {fmtHours(eva.varianceHours)} vs estimate ({eva.pctOfEstimate}%)
          </span>
        ) : null}
      </div>

      {data === null ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </p>
      ) : data.entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No time logged yet.</p>
      ) : (
        <ul className="space-y-1">
          {data.entries.map((e) => (
            <li
              key={e.id}
              className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-sm"
            >
              <span className="shrink-0 font-medium tabular-nums">
                {e.endedAt === null
                  ? "running…"
                  : formatDuration(e.durationSeconds ?? 0)}
              </span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {e.userName ?? "Someone"}
                {e.note ? ` · ${e.note}` : ""}
                {e.source === "manual" ? " · manual" : ""}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(e.startedAt), { addSuffix: true })}
              </span>
              {e.userId === currentUserId && e.endedAt !== null ? (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Delete entry"
                  disabled={busy}
                  onClick={() => remove(e)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-2 md:grid-cols-[6rem_minmax(0,1fr)_auto] md:items-end">
        <div className="grid gap-1 md:w-24">
          <Label className="text-xs">Add minutes</Label>
          <Input
            type="number"
            min="1"
            step="5"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            placeholder="30"
          />
        </div>
        <div className="grid flex-1 gap-1">
          <Label className="text-xs">Note (optional)</Label>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What did you work on?"
          />
        </div>
        <Button
          variant="outline"
          className="w-full md:w-auto"
          disabled={busy || !minutes}
          onClick={add}
        >
          Log
        </Button>
      </div>
    </div>
  );
}
