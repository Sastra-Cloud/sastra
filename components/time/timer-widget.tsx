"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock, Play, Square } from "lucide-react";

import {
  listStartableTasks,
  startTimer,
  stopTimer,
} from "@/lib/tasks/time-actions";
import { elapsedSeconds, formatClock } from "@/lib/time";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useActiveTimer } from "@/components/time/active-timer-provider";
import { toast } from "sonner";

type StartableTask = { id: string; title: string; projectTitle: string | null };

/**
 * App-wide running-timer widget: a live-ticking pill when a timer is running,
 * or a header launcher (pick a task to start) when idle. The active timer comes
 * from the layout, so `router.refresh()` after any timer action keeps it in sync.
 */
export function TimerWidget() {
  const router = useRouter();
  const { activeTimer: active, setActiveTimer: setActive } = useActiveTimer();
  const [pending, start] = useTransition();
  const [, setTick] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [tasks, setTasks] = useState<StartableTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);

  // Re-render once a second while running.
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
    // Restart the tick only when the running entry changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.entryId]);

  const stop = () => {
    const previous = active;
    setActive(null);
    start(async () => {
      try {
        await stopTimer();
        router.refresh();
      } catch (error) {
        setActive(previous);
        toast.error(error instanceof Error ? error.message : "Could not stop the timer.");
      }
    });
  };

  const startOn = (taskId: string) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    setActive({
      entryId: `pending-${crypto.randomUUID()}`,
      taskId,
      taskTitle: task.title,
      projectSlug: null,
      startedAt: new Date().toISOString(),
    });
    setPickerOpen(false);
    start(async () => {
      try {
        await startTimer(taskId);
        router.refresh();
      } catch (error) {
        setActive(null);
        setPickerOpen(true);
        toast.error(error instanceof Error ? error.message : "Could not start the timer.");
      }
    });
  };

  const openPicker = async (open: boolean) => {
    setPickerOpen(open);
    if (!open) return;
    setLoadingTasks(true);
    try {
      setTasks(await listStartableTasks());
    } finally {
      setLoadingTasks(false);
    }
  };

  if (active) {
    const elapsed = elapsedSeconds(active.startedAt, new Date());
    const href = active.projectSlug
      ? `/projects/${active.projectSlug}/tasks`
      : "/tasks";
    return (
      <div className="flex h-10 min-w-0 max-w-36 items-center overflow-hidden rounded-full border bg-card shadow-sm sm:max-w-72">
        <Link
          href={href}
          aria-label={`View running timer for ${active.taskTitle}`}
          className="flex min-w-0 flex-1 items-center gap-2 py-1 pr-1 pl-3 transition-colors hover:bg-accent/60"
          title={active.taskTitle}
        >
          <span className="relative flex size-2.5 shrink-0" aria-hidden>
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-70" />
            <span className="relative inline-flex size-2.5 rounded-full bg-success" />
          </span>
          <span className="shrink-0 tabular-nums text-sm font-medium">
            {formatClock(elapsed)}
          </span>
          <span className="hidden min-w-0 max-w-40 truncate text-xs text-muted-foreground sm:block lg:max-w-48">
            {active.taskTitle}
          </span>
        </Link>
        <button
          type="button"
          aria-label="Stop timer"
          title="Stop timer"
          onClick={stop}
          disabled={pending}
          className="mr-1 flex size-7 shrink-0 items-center justify-center rounded-full text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
        >
          <Square className="size-3.5 fill-current" />
        </button>
      </div>
    );
  }

  return (
    <Popover open={pickerOpen} onOpenChange={openPicker}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Start a timer"
            title="Start a timer"
          />
        }
      >
        <Clock className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="end" side="bottom" className="w-72">
        <p className="px-1 pb-1 text-xs font-medium text-muted-foreground">
          Start a timer on…
        </p>
        {loadingTasks ? (
          <p className="p-2 text-xs text-muted-foreground">Loading…</p>
        ) : tasks.length === 0 ? (
          <p className="p-2 text-xs text-muted-foreground">
            No open tasks assigned to you.
          </p>
        ) : (
          <ul className="max-h-64 space-y-0.5 overflow-y-auto">
            {tasks.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => startOn(t.id)}
                  disabled={pending}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent disabled:opacity-50"
                >
                  <Play className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{t.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {t.projectTitle ?? "No project"}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
