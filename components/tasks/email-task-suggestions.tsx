"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  CalendarClock,
  Check,
  CheckCircle2,
  MailCheck,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  acceptEmailTaskSuggestion,
  dismissEmailTaskSuggestion,
  markEmailTaskSuggestionAlreadyDone,
} from "@/lib/email/task-suggestion-actions";
import type { EmailTaskSuggestionRow } from "@/lib/email/task-suggestions";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { usePropState } from "@/hooks/use-prop-state";

type Option = { id: string; name: string };
type Draft = Pick<
  EmailTaskSuggestionRow,
  "title" | "description" | "dueDate" | "priority" | "projectId" | "assignedTo"
>;

const NO_PROJECT = "__none__";

export function EmailTaskSuggestions({
  initialSuggestions,
  assignees,
  projects,
  currentUserId,
  canManage,
  highlightedId,
  showCorrespondenceLink = false,
}: {
  initialSuggestions: EmailTaskSuggestionRow[];
  assignees: Option[];
  projects: Option[];
  currentUserId: string;
  canManage: boolean;
  highlightedId?: string | null;
  showCorrespondenceLink?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [suggestions, setSuggestions] = usePropState(initialSuggestions);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(initialSuggestions.map((item) => [item.id, draftFor(item)]))
  );
  const [dismissId, setDismissId] = useState<string | null>(null);
  const [dismissReason, setDismissReason] = useState("");

  useEffect(() => {
    if (!highlightedId) return;
    document
      .getElementById(`email-task-suggestion-${highlightedId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightedId]);

  if (!suggestions.length) return null;

  const patchDraft = (id: string, patch: Partial<Draft>) =>
    setDrafts((current) => ({
      ...current,
      [id]: { ...current[id], ...patch },
    }));

  const accept = (suggestion: EmailTaskSuggestionRow) => {
    const draft = drafts[suggestion.id] ?? draftFor(suggestion);
    const previousIndex = suggestions.findIndex((item) => item.id === suggestion.id);
    setSuggestions((current) => current.filter((item) => item.id !== suggestion.id));
    const toastId = toast.loading("Creating task…");
    startTransition(async () => {
      try {
        const result = await acceptEmailTaskSuggestion(suggestion.id, draft);
        if (result.error) throw new Error(result.error);
        toast.success("Task added to My Work", { id: toastId });
        router.refresh();
      } catch (error) {
        setSuggestions((current) => {
          const next = current.filter((item) => item.id !== suggestion.id);
          next.splice(Math.max(0, previousIndex), 0, suggestion);
          return next;
        });
        toast.error(error instanceof Error ? error.message : "Could not create the task.", {
          id: toastId,
        });
      }
    });
  };

  const dismiss = (suggestion: EmailTaskSuggestionRow) => {
    const previousIndex = suggestions.findIndex((item) => item.id === suggestion.id);
    setSuggestions((current) => current.filter((item) => item.id !== suggestion.id));
    setDismissId(null);
    const reason = dismissReason;
    setDismissReason("");
    startTransition(async () => {
      try {
        const result = await dismissEmailTaskSuggestion(suggestion.id, reason);
        if (result.error) throw new Error(result.error);
        toast.success("Suggestion dismissed");
        router.refresh();
      } catch (error) {
        setSuggestions((current) => {
          const next = current.filter((item) => item.id !== suggestion.id);
          next.splice(Math.max(0, previousIndex), 0, suggestion);
          return next;
        });
        toast.error(error instanceof Error ? error.message : "Could not dismiss the suggestion.");
      }
    });
  };

  const markAlreadyDone = (suggestion: EmailTaskSuggestionRow) => {
    const previousIndex = suggestions.findIndex(
      (item) => item.id === suggestion.id
    );
    setSuggestions((current) =>
      current.filter((item) => item.id !== suggestion.id)
    );
    const toastId = toast.loading("Marking suggestion done…");
    startTransition(async () => {
      try {
        const result = await markEmailTaskSuggestionAlreadyDone(suggestion.id);
        if (result.error) throw new Error(result.error);
        toast.success("Already-completed work cleared", { id: toastId });
        router.refresh();
      } catch (error) {
        setSuggestions((current) => {
          const next = current.filter((item) => item.id !== suggestion.id);
          next.splice(Math.max(0, previousIndex), 0, suggestion);
          return next;
        });
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not mark the suggestion done.",
          { id: toastId }
        );
      }
    });
  };

  return (
    <section
      aria-labelledby="email-task-suggestions-heading"
      className="overflow-hidden rounded-xl border border-primary/25 bg-card surface-shadow"
    >
      <div className="flex items-start gap-3 border-b bg-primary/[0.045] px-4 py-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
          <MailCheck className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 id="email-task-suggestions-heading" className="text-sm font-semibold">
            Sastra found {suggestions.length === 1 ? "a possible next step" : "possible next steps"}
          </h2>
          <p className="text-xs leading-5 text-muted-foreground">
            Review each suggestion, then add it, mark it already done, or dismiss it.
          </p>
        </div>
      </div>

      <div className="divide-y">
        {suggestions.map((suggestion) => {
          const draft = drafts[suggestion.id] ?? draftFor(suggestion);
          const highlighted = suggestion.id === highlightedId;
          return (
            <article
              id={`email-task-suggestion-${suggestion.id}`}
              key={suggestion.id}
              className={cn(
                "grid gap-4 p-4 transition-colors lg:grid-cols-[minmax(0,1fr)_13rem]",
                highlighted && "bg-primary/[0.06] ring-1 ring-inset ring-primary/30"
              )}
            >
              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                    <Sparkles className="size-3.5 text-primary" />
                    {actionLabel(suggestion.actionKind)}
                  </span>
                  {suggestion.sourceSender ? <span>From {suggestion.sourceSender}</span> : null}
                  {suggestion.sourceEmailDate ? (
                    <span>Email dated {formatDate(suggestion.sourceEmailDate)}</span>
                  ) : null}
                  {showCorrespondenceLink ? (
                    <Link
                      href={`/correspondence/${suggestion.threadId}`}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      View email <ArrowUpRight className="size-3" />
                    </Link>
                  ) : null}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor={`email-task-title-${suggestion.id}`}>Task</Label>
                    <Input
                      id={`email-task-title-${suggestion.id}`}
                      value={draft.title}
                      onChange={(event) => patchDraft(suggestion.id, { title: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor={`email-task-description-${suggestion.id}`}>Notes</Label>
                    <Textarea
                      id={`email-task-description-${suggestion.id}`}
                      rows={2}
                      value={draft.description ?? ""}
                      onChange={(event) =>
                        patchDraft(suggestion.id, { description: event.target.value || null })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`email-task-due-${suggestion.id}`}>Due date</Label>
                    <Input
                      id={`email-task-due-${suggestion.id}`}
                      type="date"
                      value={draft.dueDate ?? ""}
                      onChange={(event) =>
                        patchDraft(suggestion.id, { dueDate: event.target.value || null })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Priority</Label>
                    <Select
                      value={draft.priority}
                      onValueChange={(value) =>
                        patchDraft(suggestion.id, {
                          priority: value as Draft["priority"],
                        })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue>
                          {(value: string | null) =>
                            value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : "Medium"
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Project</Label>
                    <Select
                      value={draft.projectId ?? NO_PROJECT}
                      onValueChange={(value) =>
                        patchDraft(suggestion.id, {
                          projectId: value === NO_PROJECT ? null : value,
                        })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue>
                          {(value: string | null) =>
                            !value || value === NO_PROJECT
                              ? "No project"
                              : projects.find((project) => project.id === value)?.name ?? "Project"
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_PROJECT}>No project</SelectItem>
                        {projects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Assignee</Label>
                    <Select
                      value={canManage ? draft.assignedTo : currentUserId}
                      disabled={!canManage}
                      onValueChange={(value) => {
                        if (value) patchDraft(suggestion.id, { assignedTo: value });
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue>
                          {(value: string | null) =>
                            assignees.find((assignee) => assignee.id === value)?.name ?? "Assignee"
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {assignees.map((assignee) => (
                          <SelectItem key={assignee.id} value={assignee.id}>{assignee.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {suggestion.primaryUrl ? (
                  <a
                    href={suggestion.primaryUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex min-h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium text-primary transition-colors hover:bg-muted"
                  >
                    <CalendarClock className="size-4" />
                    {suggestion.primaryUrlLabel || "Open link from email"}
                    <ArrowUpRight className="size-3.5" />
                  </a>
                ) : null}
              </div>

              <div className="flex flex-col justify-between gap-3 lg:border-l lg:pl-4">
                <p className="text-xs leading-5 text-muted-foreground">{suggestion.reason}</p>
                {dismissId === suggestion.id ? (
                  <div className="space-y-2">
                    <Label htmlFor={`dismiss-reason-${suggestion.id}`}>Why is this not useful? <span className="font-normal text-muted-foreground">Optional</span></Label>
                    <Textarea
                      id={`dismiss-reason-${suggestion.id}`}
                      rows={2}
                      autoFocus
                      value={dismissReason}
                      onChange={(event) => setDismissReason(event.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setDismissId(null)}>Keep</Button>
                      <Button size="sm" variant="destructive" onClick={() => dismiss(suggestion)}>Dismiss</Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-2">
                    <Button
                      onClick={() => accept(suggestion)}
                      disabled={pending || !draft.title.trim()}
                    >
                      <Check className="size-4" /> Add task
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => markAlreadyDone(suggestion)}
                      disabled={pending}
                    >
                      <CheckCircle2 className="size-4" /> Already done
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setDismissId(suggestion.id)}
                      disabled={pending}
                    >
                      <X className="size-4" /> Not a task
                    </Button>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function draftFor(item: EmailTaskSuggestionRow): Draft {
  return {
    title: item.title,
    description: item.description,
    dueDate: item.dueDate,
    priority: item.priority,
    projectId: item.projectId,
    assignedTo: item.assignedTo,
  };
}

function actionLabel(kind: EmailTaskSuggestionRow["actionKind"]) {
  return {
    schedule_meeting: "Meeting follow-up",
    reply: "Reply",
    follow_up: "Follow up",
    review: "Review",
    send: "Send",
    general: "Next step",
  }[kind];
}
