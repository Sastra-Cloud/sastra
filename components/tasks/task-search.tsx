"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Loader2, Search, SearchX, X } from "lucide-react";

import type { MyWorkTaskRow } from "@/lib/tasks/queries";
import { listTaskSearchResults } from "@/lib/tasks/search-actions";
import {
  matchesTaskSearch,
  myWorkTaskLocations,
  otherTaskReason,
  rankTaskSearchMatches,
  taskSearchTerms,
} from "@/lib/tasks/search";
import { TaskStatusBadge } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dueLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

const SEARCH_DELAY_MS = 250;

type RemoteResult = {
  key: string;
  tasks: MyWorkTaskRow[];
  hasMore: boolean;
  failed: boolean;
};

/**
 * Debounced server search for tasks outside My Work. `revision` changes after
 * each server refresh, so saved edits are re-read without clearing the list.
 */
export function useOtherTaskSearch(query: string, revision: unknown) {
  const key = taskSearchTerms(query).join(" ");
  const [result, setResult] = useState<RemoteResult | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      listTaskSearchResults(key)
        .then((found) => {
          if (!cancelled) setResult({ key, ...found, failed: false });
        })
        .catch(() => {
          if (!cancelled) setResult({ key, tasks: [], hasMore: false, failed: true });
        });
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [key, revision, attempt]);

  const current = result?.key === key ? result : null;
  return {
    result: current,
    loading: Boolean(key) && !current,
    retry: () => setAttempt((value) => value + 1),
    // Optimistic edits from the task dialog apply to these rows too.
    update: (apply: (tasks: MyWorkTaskRow[]) => MyWorkTaskRow[]) =>
      setResult((value) => (value ? { ...value, tasks: apply(value.tasks) } : value)),
  };
}

export function TaskSearchField({
  value,
  onValueChange,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)} role="search">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value) {
            event.preventDefault();
            onValueChange("");
          }
        }}
        className="h-10 pr-10 pl-9 [&::-webkit-search-cancel-button]:hidden"
        placeholder="Search all tasks"
        aria-label="Search tasks"
        autoComplete="off"
        enterKeyHint="search"
      />
      {value ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute top-1/2 right-0.5 size-9 -translate-y-1/2"
          onClick={() => onValueChange("")}
          aria-label="Clear search"
        >
          <X className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}

export function TaskSearchResults({
  query,
  tasks,
  other,
  todayIso,
  timeZone,
  currentUserId,
  onOpen,
}: {
  query: string;
  tasks: MyWorkTaskRow[];
  other: ReturnType<typeof useOtherTaskSearch>;
  todayIso: string;
  timeZone: string;
  currentUserId: string;
  onOpen: (task: MyWorkTaskRow) => void;
}) {
  const terms = taskSearchTerms(query);
  if (terms.length === 0) {
    return (
      <p className="rounded-xl border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
        Type at least 2 letters to search.
      </p>
    );
  }

  const locations = myWorkTaskLocations(tasks, todayIso, timeZone);
  const mine = rankTaskSearchMatches(
    tasks.filter((task) => matchesTaskSearch(task, terms)),
    terms
  );
  const loadedIds = new Set(tasks.map((task) => task.id));
  const others = (other.result?.tasks ?? []).filter((task) => !loadedIds.has(task.id));
  const settled = !other.loading && !other.result?.failed;
  const nothingFound = mine.length === 0 && others.length === 0 && settled;
  const total = mine.length + others.length;

  return (
    <div className="space-y-5">
      <p className="sr-only" aria-live="polite">
        {other.loading ? "Searching" : `${total} ${total === 1 ? "task" : "tasks"} found`}
      </p>

      {nothingFound ? (
        <div className="rounded-xl border bg-card px-4 py-10 text-center">
          <SearchX className="mx-auto mb-2 size-6 text-muted-foreground" />
          <p className="font-medium">No tasks match “{query.trim()}”</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Check the spelling or use fewer words. Deleted tasks cannot be found.
          </p>
        </div>
      ) : null}

      {mine.length > 0 ? (
        <ResultGroup
          title="In My Work"
          description="Your tasks, including ones in closed sections"
          count={mine.length}
        >
          {mine.map((task) => (
            <ResultRow
              key={task.id}
              task={task}
              terms={terms}
              todayIso={todayIso}
              place={locations.get(task.id) ?? "In My Work"}
              onOpen={onOpen}
            />
          ))}
        </ResultGroup>
      ) : null}

      {others.length > 0 || !nothingFound ? (
        <ResultGroup
          title="Other tasks"
          description="Older done work, and tasks assigned to someone else or not assigned"
          count={other.loading ? null : others.length}
        >
          {others.map((task) => (
            <ResultRow
              key={task.id}
              task={task}
              terms={terms}
              todayIso={todayIso}
              place={otherTaskReason(task, currentUserId, todayIso, timeZone)}
              onOpen={onOpen}
            />
          ))}
          {other.loading && others.length === 0 ? (
            <li className="flex items-center gap-2 px-4 py-4 text-sm text-muted-foreground" role="status">
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> Searching all tasks…
            </li>
          ) : null}
          {other.result?.failed ? (
            <li className="flex flex-wrap items-center gap-3 px-4 py-4 text-sm" role="alert">
              <span className="text-destructive">Couldn’t search other tasks. Check your internet and try again.</span>
              <Button type="button" size="sm" variant="outline" onClick={other.retry}>
                Try again
              </Button>
            </li>
          ) : null}
          {settled && others.length === 0 && mine.length > 0 ? (
            <li className="px-4 py-4 text-sm text-muted-foreground">No other tasks match.</li>
          ) : null}
        </ResultGroup>
      ) : null}

      {other.result?.hasMore ? (
        <p className="text-center text-xs text-muted-foreground">
          Showing the first {others.length} other tasks. Add more words to find the task you need.
        </p>
      ) : null}
    </div>
  );
}

function ResultGroup({
  title,
  description,
  count,
  children,
}: {
  title: string;
  description: string;
  count: number | null;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {count !== null ? (
          <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
        ) : null}
      </div>
      <ul className="divide-y overflow-hidden rounded-xl border bg-card">{children}</ul>
    </section>
  );
}

function ResultRow({
  task,
  terms,
  todayIso,
  place,
  onOpen,
}: {
  task: MyWorkTaskRow;
  terms: string[];
  todayIso: string;
  place: string;
  onOpen: (task: MyWorkTaskRow) => void;
}) {
  const done = task.status === "done";
  const due = done ? null : dueLabel(task.dueDate, todayIso);
  const saving = task.id.startsWith("optimistic-task-");
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(task)}
        disabled={saving}
        className="flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset sm:items-center"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground">
          {done ? <CheckCircle2 className="size-5 text-success" /> : <Circle className="size-5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("line-clamp-2 text-sm font-semibold sm:line-clamp-1", done && "text-muted-foreground")}>
            <Highlight text={task.title} terms={terms} />
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="max-w-full truncate">
              <Highlight text={task.projectTitle ?? "No project"} terms={terms} />
            </span>
            {place ? (
              <Separated className="font-medium text-foreground/80">{place}</Separated>
            ) : null}
            {due && due.tone !== "none" ? (
              <Separated
                className={cn(
                  due.tone === "overdue" && "font-medium text-destructive",
                  due.tone === "soon" && "text-warning-text"
                )}
              >
                {due.text}
              </Separated>
            ) : null}
            {saving ? <span role="status">Saving…</span> : null}
          </span>
        </span>
        <TaskStatusBadge status={task.status} className="shrink-0" />
      </button>
    </li>
  );
}

/** The dot travels with its item, so a wrapped line never ends on a separator. */
function Separated({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex gap-2">
      <span aria-hidden className="text-muted-foreground">·</span>
      <span className={className}>{children}</span>
    </span>
  );
}

function Highlight({ text, terms }: { text: string; terms: string[] }) {
  const pattern = new RegExp(
    `(${terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "gi"
  );
  return text.split(pattern).map((part, index) =>
    index % 2 === 1 ? (
      <mark key={index} className="rounded-sm bg-primary/15 px-0.5 text-foreground">
        {part}
      </mark>
    ) : (
      part
    )
  );
}
