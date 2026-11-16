"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { PanelRight, Pin, PinOff } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useOptimisticAction } from "@/hooks/use-optimistic-action";
import { getTaskPinSnapshot, setTaskPinned } from "@/lib/tasks/pin-actions";
import { updateTaskStatus } from "@/lib/tasks/actions";
import { showTaskCompleted } from "@/lib/tasks/completion-feedback";
import { isSourceControlledTask } from "@/lib/tasks/task-source";
import type { MyTaskRow } from "@/lib/tasks/queries";
import { cn } from "@/lib/utils";

const PinnedTasksPanel = dynamic(() => import("./pinned-tasks-panel").then(module => module.PinnedTasksPanel));
type Snapshot = Awaited<ReturnType<typeof getTaskPinSnapshot>>;
type Mutation = { type: "pin"; task: MyTaskRow; pinned: boolean } | { type: "complete"; task: MyTaskRow };
const EMPTY: Snapshot = { tasks: [], pinnedIds: [] };
const PREFERENCE_EVENT = "sastra:task-panel-preference";
const fallbackPreferences = new Map<string, boolean>();

function updateSnapshot(current: Snapshot, change: Mutation): Snapshot {
  if (change.type === "complete") return { ...current, tasks: current.tasks.filter(task => task.id !== change.task.id) };
  return {
    tasks: current.tasks.some(task => task.id === change.task.id) ? current.tasks : [...current.tasks, change.task],
    pinnedIds: change.pinned
      ? [...current.pinnedIds.filter(id => id !== change.task.id), change.task.id]
      : current.pinnedIds.filter(id => id !== change.task.id),
  };
}
const mutationKey = (change: Mutation) => change.task.id;
function subscribePreference(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener(PREFERENCE_EVENT, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(PREFERENCE_EVENT, notify);
  };
}

type PanelContext = {
  userId: string;
  open: boolean;
  available: boolean;
  docked: boolean;
  snapshot: Snapshot;
  loading: boolean;
  loaded: boolean;
  error: string | null;
  pendingIds: Set<string>;
  setOpen: (open: boolean) => void;
  setAvailable: (available: boolean) => void;
  setAssistantOpen: (open: boolean) => void;
  setPinned: (task: MyTaskRow, pinned: boolean) => void;
  complete: (task: MyTaskRow) => void;
  refresh: () => Promise<void>;
};
const Context = createContext<PanelContext | null>(null);
export const usePinnedTasks = () => useContext(Context);

export function PinnedTasksProvider({ children, userId }: { children: React.ReactNode; userId: string }) {
  const preferenceKey = `sastra:task-panel:v1:${userId}`;
  const readPreference = useCallback(() => {
    if (fallbackPreferences.has(preferenceKey)) return fallbackPreferences.get(preferenceKey)!;
    try { return window.localStorage.getItem(preferenceKey) === "open"; }
    catch { return fallbackPreferences.get(preferenceKey) ?? false; }
  }, [preferenceKey]);
  const open = useSyncExternalStore(subscribePreference, readPreference, () => false);
  const setOpen = useCallback((next: boolean) => {
    try {
      window.localStorage.setItem(preferenceKey, next ? "open" : "closed");
      fallbackPreferences.delete(preferenceKey);
    } catch { fallbackPreferences.set(preferenceKey, next); }
    window.dispatchEvent(new Event(PREFERENCE_EVENT));
  }, [preferenceKey]);
  const [available, setAvailable] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [snapshot, setSnapshot] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const writes = useRef(new Set<string>());
  const generation = useRef(0);
  const pathname = usePathname();
  const router = useRouter();
  const optimistic = useOptimisticAction({ state: snapshot, update: updateSnapshot, getKey: mutationKey });
  const refresh = useCallback(async () => {
    if (writes.current.size) return;
    const request = ++generation.current;
    setLoading(true);
    try {
      const next = await getTaskPinSnapshot();
      if (request !== generation.current || writes.current.size) return;
      setSnapshot(next);
      setLoaded(true);
      setError(null);
    } catch {
      if (request === generation.current) setError("Could not load your tasks. Try again.");
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!available) return;
    const onFocus = () => { void refresh(); };
    const first = window.setTimeout(onFocus, 0);
    window.addEventListener("focus", onFocus);
    // Keep references current when work changes on this or another screen.
    const interval = open ? window.setInterval(onFocus, 30_000) : null;
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearTimeout(first);
      if (interval !== null) window.clearInterval(interval);
    };
  }, [available, open, pathname, refresh]);

  const begin = (taskId: string) => {
    if (writes.current.has(taskId)) return false;
    writes.current.add(taskId);
    ++generation.current; // An older read must never undo immediate feedback.
    return true;
  };
  const finish = (taskId: string) => {
    writes.current.delete(taskId);
    if (!writes.current.size) void refresh();
  };
  const setPinned = (task: MyTaskRow, pinned: boolean) => {
    if (task.assignedTo !== userId || task.status === "done" || !begin(task.id)) return;
    optimistic.run({ type: "pin", task, pinned }, () => setTaskPinned(task.id, pinned), {
      onSuccess: () => {
        finish(task.id);
        if (!pinned) toast.success("Task unpinned", { description: "It stays in My Work.", action: { label: "Undo", onClick: () => setPinned(task, true) } });
      },
      onError: () => finish(task.id),
      errorMessage: "Could not save your pinned tasks.",
    });
  };
  const complete = (task: MyTaskRow) => {
    if (isSourceControlledTask(task) || !begin(task.id)) return;
    optimistic.run({ type: "complete", task }, () => updateTaskStatus(task.id, "done"), {
      onSuccess: result => {
        finish(task.id);
        showTaskCompleted(result, href => router.push(href));
        router.refresh();
      },
      onError: () => finish(task.id),
      errorMessage: "Could not complete the task. It has been restored.",
    });
  };
  return <Context value={{ userId, open, available, docked: available && open && !assistantOpen,
    snapshot: optimistic.state, loading, loaded, error, pendingIds: optimistic.pendingKeys,
    setOpen, setAvailable, setAssistantOpen, setPinned, complete, refresh }}>
    {children}
  </Context>;
}

/** Measure space after navigation, independently of the panel's own width. */
export function PinnedTasksWorkspace({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const panel = usePinnedTasks();
  const setAvailable = panel?.setAvailable;
  useEffect(() => {
    const element = ref.current;
    if (!element || !setAvailable) return;
    const observer = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width >= 1152));
    observer.observe(element);
    return () => observer.disconnect();
  }, [setAvailable]);
  return <div ref={ref} className="flex min-h-0 min-w-0 flex-col">{children}</div>;
}

export function PinnedTasksCanvas({ children }: { children: React.ReactNode }) {
  const panel = usePinnedTasks();
  return <div className={cn("grid min-w-0 flex-1", panel?.docked && "grid-cols-[minmax(0,1fr)_21rem]")}>
    {children}
    {panel?.docked ? <PinnedTasksPanel /> : null}
  </div>;
}

export function PinnedTasksToggle() {
  const panel = usePinnedTasks();
  if (!panel?.available) return null;
  return <Button id="pinned-tasks-toggle" variant="ghost" size="icon" aria-label={panel.open ? "Close pinned tasks" : "Open pinned tasks"}
    title="Pinned tasks" aria-expanded={panel.docked} aria-controls={panel.docked ? "pinned-tasks-panel" : undefined}
    onClick={() => panel.setOpen(!panel.open)}>
    <PanelRight className="size-5" />
  </Button>;
}

export function TaskPinButton({ task }: { task: MyTaskRow }) {
  const panel = usePinnedTasks();
  if (!panel?.available || task.assignedTo !== panel.userId || task.status === "done" || task.id.startsWith("optimistic-")) return null;
  const pinned = panel.snapshot.pinnedIds.includes(task.id);
  return <Button type="button" variant="ghost" size="icon" disabled={!panel.loaded || panel.pendingIds.has(task.id)}
    aria-label={`${pinned ? "Unpin" : "Pin"} ${task.title}`} aria-pressed={pinned}
    title={pinned ? "Unpin from task panel" : "Pin to task panel"}
    className={cn(pinned ? "text-primary" : "text-muted-foreground")}
    onClick={() => { panel.setPinned(task, !pinned); if (!pinned) panel.setOpen(true); }}>
    {pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
  </Button>;
}
