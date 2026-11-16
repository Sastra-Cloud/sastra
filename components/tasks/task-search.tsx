"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Circle, Loader2, Search, SearchX, X } from "lucide-react";

import type { MyWorkTaskRow } from "@/lib/tasks/queries";
import { listTaskSearchResults } from "@/lib/tasks/search-actions";
import {
  matchesTaskSearch,
  myWorkTaskLocations,
  otherTaskReason,
  rankTaskSearchMatches,
  splitOtherTaskResults,
  taskSearchTerms,
  type TaskSearchScope,
} from "@/lib/tasks/search";
import { TaskStatusBadge } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dueLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

const SEARCH_DELAY_MS = 250;

const SCOPES: { value: TaskSearchScope; label: string }[] = [
  { value: "all", label: "All tasks" },
  { value: "mine", label: "Assigned to me" },
];

const countTasks = (count: number, word = "task") =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

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
  scope,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  scope: TaskSearchScope;
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
        placeholder={scope === "mine" ? "Search my tasks" : "Search all tasks"}
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
  scope,
  onScopeChange,
  tasks,
  other,
  todayIso,
  timeZone,
  currentUserId,
  onOpen,
}: {
  query: string;
  scope: TaskSearchScope;
  onScopeChange: (scope: TaskSearchScope) => void;
  tasks: MyWorkTaskRow[];
  other: ReturnType<typeof useOtherTaskSearch>;
  todayIso: string;
  timeZone: string;
  currentUserId: string;
  onOpen: (task: MyWorkTaskRow) => void;
}) {
  const allScopeButton = useRef<HTMLButtonElement>(null);
  const terms = taskSearchTerms(query);
  const mineOnly = scope === "mine";

  const locations = myWorkTaskLocations(tasks, todayIso, timeZone);
  const mine = rankTaskSearchMatches(
    tasks.filter((task) => matchesTaskSearch(task, terms)),
    terms
  );
  const loadedIds = new Set(tasks.map((task) => task.id));
  const found = (other.result?.tasks ?? []).filter((task) => !loadedIds.has(task.id));
  const split = splitOtherTaskResults(found, other.result?.hasMore ?? false, currentUserId);
  const others = mineOnly ? split.mine : found;
  const hasMore = mineOnly ? split.mineHasMore : Boolean(other.result?.hasMore);
  const hiddenCount = mineOnly ? split.notMineCount : 0;
  const settled = !other.loading && !other.result?.failed;
  const nothingFound = mine.length === 0 && others.length === 0 && settled;
  const total = mine.length + others.length;
  const summary = other.loading
    ? "Searching…"
    : other.result?.failed
      ? ""
      : `Found ${hasMore ? "more than " : ""}${countTasks(total)}${mineOnly ? " assigned to you" : ""}`;

  // The button that was pressed disappears, so move focus to the filter.
  const showAllTasks = () => {
    onScopeChange("all");
    allScopeButton.current?.focus();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row-reverse sm:items-center sm:justify-between">
        <div
          role="group"
          aria-label="Tasks to show"
          className="grid shrink-0 grid-cols-2 gap-1 rounded-lg bg-muted p-1 sm:inline-grid"
        >
          {SCOPES.map((item) => (
            <button
              key={item.value}
              ref={item.value === "all" ? allScopeButton : undefined}
              type="button"
              onClick={() => onScopeChange(item.value)}
              aria-pressed={scope === item.value}
              className={cn(
                "flex min-h-10 items-center justify-center rounded-md px-3 text-sm font-medium transition-[background-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:min-h-9 sm:text-xs",
                scope === item.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {terms.length > 0 ? summary : ""}
        </p>
      </div>

      {terms.length === 0 ? (
        <p className="rounded-xl border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          Type at least 2 letters to search.
        </p>
      ) : (
        <>
          {nothingFound ? (
            <div className="rounded-xl border bg-card px-4 py-10 text-center">
              <SearchX className="mx-auto mb-2 size-6 text-muted-foreground" />
              <p className="font-medium">
                {mineOnly ? "None of your tasks match" : "No tasks match"} “{query.trim()}”
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Check the spelling or use fewer words.
                {hiddenCount === 0 ? " Deleted tasks cannot be found." : null}
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

          {(mineOnly ? others.length > 0 || !settled : others.length > 0 || !nothingFound) ? (
            <ResultGroup
              title={mineOnly ? "Done earlier" : "Other tasks"}
              description={
                mineOnly
                  ? "Your tasks marked done more than a week ago"
                  : "Older done work, and tasks assigned to someone else or not assigned"
              }
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
                  <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />{" "}
                  {mineOnly ? "Searching your older tasks…" : "Searching all tasks…"}
                </li>
              ) : null}
              {other.result?.failed ? (
                <li className="flex flex-wrap items-center gap-3 px-4 py-4 text-sm" role="alert">
                  <span className="text-destructive">
                    {mineOnly
                      ? "Couldn’t search your older tasks. Check your internet and try again."
                      : "Couldn’t search other tasks. Check your internet and try again."}
                  </span>
                  <Button type="button" size="sm" variant="outline" onClick={other.retry}>
                    Try again
                  </Button>
                </li>
              ) : null}
              {!mineOnly && settled && others.length === 0 && mine.length > 0 ? (
                <li className="px-4 py-4 text-sm text-muted-foreground">No other tasks match.</li>
              ) : null}
            </ResultGroup>
          ) : null}

          {hasMore ? (
            <p className="text-center text-xs text-muted-foreground">
              Showing the first {others.length} {mineOnly ? "older done tasks" : "other tasks"}. Add more
              words to find the task you need.
            </p>
          ) : null}

          {hiddenCount > 0 ? (
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-xl border border-dashed px-4 py-3 text-center text-sm text-muted-foreground">
              <span>
                {other.result?.hasMore
                  ? `More than ${hiddenCount} other tasks match.`
                  : `${countTasks(hiddenCount, "other task")} ${hiddenCount === 1 ? "matches" : "match"}.`}{" "}
                Assigned to someone else or not assigned.
              </span>
              <Button type="button" size="sm" variant="outline" onClick={showAllTasks}>
                Show all tasks
              </Button>
            </div>
          ) : null}
        </>
      )}
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
