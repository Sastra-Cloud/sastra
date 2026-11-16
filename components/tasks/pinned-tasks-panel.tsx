"use client";

import { useState } from "react";
import Link from "next/link";
import { NotebookText, Pin, PinOff, Plus, Search, ShieldCheck, X } from "lucide-react";

import { usePinnedTasks } from "./pinned-tasks-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TaskCompleteButton } from "./task-complete-button";
import { isSourceControlledTask, taskSourceLink } from "@/lib/tasks/task-source";

export function PinnedTasksPanel() {
  const panel = usePinnedTasks();
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [expandedInstructions, setExpandedInstructions] = useState(new Set<string>());
  if (!panel) return null;
  const { tasks, pinnedIds } = panel.snapshot;
  const pinned = pinnedIds.flatMap(id => tasks.find(task => task.id === id) ?? []);
  const candidates = tasks.filter(task => !pinnedIds.includes(task.id) &&
    `${task.title} ${task.projectTitle ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  return <aside id="pinned-tasks-panel" aria-labelledby="pinned-tasks-heading"
    className="sticky top-16 flex h-[calc(100dvh-4rem)] min-h-0 flex-col border-l bg-card text-card-foreground">
    <header className="flex shrink-0 items-center gap-1 border-b px-3 py-1.5">
      <h2 id="pinned-tasks-heading" className="mr-auto flex min-w-0 items-center gap-2 text-sm font-semibold">
        Pinned tasks
        {panel.loaded ? <span className="text-xs font-normal tabular-nums text-muted-foreground">{pinned.length}</span> : null}
      </h2>
      <Button variant="ghost" size="sm" className="h-10 pointer-coarse:h-11" aria-expanded={adding} aria-controls="pinned-task-picker" onClick={() => setAdding(!adding)}>
        <Plus className="size-4" /> Add tasks
      </Button>
      <Button variant="ghost" size="icon" className="pointer-coarse:size-11" aria-label="Close pinned tasks" onClick={() => {
        panel.setOpen(false);
        requestAnimationFrame(() => document.getElementById("pinned-tasks-toggle")?.focus());
      }}><X className="size-4" /></Button>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      {panel.error ? <div className="m-3 rounded-lg border p-3 text-sm" role="alert">
        <p>{panel.error}</p><Button size="sm" variant="ghost" onClick={() => void panel.refresh()}>Try again</Button>
      </div> : null}
      {panel.loading && !panel.loaded ? <p className="px-4 py-3 text-sm text-muted-foreground" role="status">Loading your tasks…</p> : null}
      {adding ? <section id="pinned-task-picker" aria-label="Choose tasks to pin" className="border-y bg-muted/25 px-4 py-3">
        <label htmlFor="pinned-task-search" className="mb-2 flex items-center gap-2 text-xs font-medium"><Search className="size-3.5" /> Find your tasks</label>
        <Input id="pinned-task-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Task title or project" />
        <ul className="mt-2 divide-y">
          {candidates.map(task => <li key={task.id} className="flex items-start gap-2 py-3">
            <div className="min-w-0 flex-1"><p className="break-words text-sm">{task.title}</p><p className="mt-1 break-words text-xs text-muted-foreground">{task.projectTitle ?? "No project"}</p></div>
            <Button variant="ghost" size="icon" aria-label={`Pin ${task.title}`} disabled={panel.pendingIds.has(task.id)} onClick={() => panel.setPinned(task, true)}><Pin className="size-4" /></Button>
          </li>)}
        </ul>
        {panel.loaded && !candidates.length ? <p className="py-3 text-sm text-muted-foreground">{query ? "No matching tasks." : "All your open tasks are pinned."}</p> : null}
      </section> : null}
      {panel.loaded && !pinned.length && !adding ? <div className="px-4 py-6 text-sm text-muted-foreground">Choose <strong className="font-medium text-foreground">Add tasks</strong>, or pin a task in My Work. Your selection stays here as you move between projects.</div> : null}
      <ul className="divide-y" aria-label="Your pinned tasks">
        {pinned.map(task => {
          const controlled = isSourceControlledTask(task);
          const source = taskSourceLink(task, task.projectSlug);
          const instructionsOpen = expandedInstructions.has(task.id);
          return <li key={task.id} className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-x-1 px-2 py-2 pointer-coarse:grid-cols-[2.75rem_minmax(0,1fr)]">
            {controlled ? <span className="flex size-10 items-center justify-center text-muted-foreground pointer-coarse:size-11"><ShieldCheck className="size-4" /></span> :
              <span title="Mark complete"><TaskCompleteButton done={false} title={task.title} onToggle={() => panel.complete(task)} disabled={panel.pendingIds.has(task.id)} hoverPreview className="flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-success/10 hover:text-success focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 pointer-coarse:size-11" /></span>}
            <div className="min-w-0">
              <div className="flex min-h-10 items-center gap-1">
                {task.projectSlug ? <Link href={`/projects/${task.projectSlug}/tasks`} className="min-w-0 flex-1 break-words text-sm font-semibold hover:underline [overflow-wrap:anywhere]">{task.projectTitle}</Link> : <p className="min-w-0 flex-1 text-xs text-muted-foreground">No project</p>}
                {task.description ? <Button variant="ghost" size="icon" className="text-muted-foreground pointer-coarse:size-11"
                  aria-label={`${instructionsOpen ? "Hide" : "Show"} instructions for ${task.title}`}
                  title={instructionsOpen ? "Hide instructions" : "Show instructions"}
                  aria-expanded={instructionsOpen} aria-controls={instructionsOpen ? `pinned-instructions-${task.id}` : undefined}
                  onClick={() => setExpandedInstructions(current => {
                    const next = new Set(current);
                    if (next.has(task.id)) next.delete(task.id); else next.add(task.id);
                    return next;
                  })}><NotebookText className="size-3.5" /></Button> : null}
                <Button variant="ghost" size="icon" className="text-muted-foreground pointer-coarse:size-11" aria-label={`Unpin ${task.title}`} title="Unpin; keep task in My Work" disabled={panel.pendingIds.has(task.id)} onClick={() => panel.setPinned(task, false)}><PinOff className="size-3.5" /></Button>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm leading-5 [overflow-wrap:anywhere]">{task.title}</p>
              {instructionsOpen && task.description ? <p id={`pinned-instructions-${task.id}`} className="mt-2 whitespace-pre-wrap break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">{task.description}</p> : null}
              {task.blockedByTitle ? <p className="mt-1 text-xs text-warning-text">Blocked by {task.blockedByTitle}</p> : null}
              {controlled ? <Link href={source?.href ?? `/tasks?task=${task.id}`} className="inline-flex min-h-10 items-center text-xs text-primary hover:underline">{source?.label ?? "Open task to review"}</Link> : null}
            </div>
          </li>;
        })}
      </ul>
    </div>
    <footer className="shrink-0 border-t px-3 py-1.5"><Link href="/tasks" className="inline-flex min-h-10 items-center text-xs text-muted-foreground hover:text-foreground hover:underline">Open My Work →</Link></footer>
  </aside>;
}
