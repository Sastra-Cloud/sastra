"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  Clock3,
  ExternalLink,
  Loader2,
  Mail,
  MessageSquareText,
} from "lucide-react";
import { toast } from "sonner";

import type { ExternalFollowUp } from "@/lib/email/follow-ups";
import {
  resolveExternalFollowUp,
  snoozeExternalFollowUp,
} from "@/lib/email/follow-up-actions";
import { postProjectUpdate } from "@/lib/projects/status-actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/format";

function dueInLabel(value: Date, now: number) {
  const minutes = Math.max(1, Math.ceil((value.getTime() - now) / 60_000));
  if (minutes < 60) return `Follow up in ${minutes}m`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return `Follow up in ${hours}h`;
  const days = Math.ceil(hours / 24);
  return `Follow up in ${days}d`;
}

export function ExternalFollowUpCard({
  followUp,
  showProject = false,
  allowProjectUpdate = false,
}: {
  followUp: ExternalFollowUp;
  showProject?: boolean;
  allowProjectUpdate?: boolean;
}) {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const [snoozeLabel, setSnoozeLabel] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [updateBody, setUpdateBody] = useState(followUp.summary);
  const [pending, startTransition] = useTransition();
  const [renderedAt] = useState(() => Date.now());
  const effectiveDue = followUp.snoozedUntil ?? followUp.dueAt;
  const due = effectiveDue.getTime() <= renderedAt;

  if (hidden) return null;

  const snooze = (businessDays: number) => {
    const previous = snoozeLabel;
    setSnoozeLabel(`Snoozed ${businessDays} business day${businessDays === 1 ? "" : "s"}`);
    startTransition(async () => {
      try {
        await snoozeExternalFollowUp({ id: followUp.id, businessDays });
        router.refresh();
        toast.success("Follow-up snoozed");
      } catch (error) {
        setSnoozeLabel(previous);
        toast.error(error instanceof Error ? error.message : "Could not snooze the follow-up.");
      }
    });
  };

  const resolve = () => {
    setHidden(true);
    startTransition(async () => {
      try {
        await resolveExternalFollowUp(followUp.id);
        router.refresh();
        toast.success("Follow-up resolved");
      } catch (error) {
        setHidden(false);
        toast.error(error instanceof Error ? error.message : "Could not resolve the follow-up.");
      }
    });
  };

  const postUpdate = () => {
    const body = updateBody.trim();
    if (!body) return;
    startTransition(async () => {
      try {
        await postProjectUpdate(followUp.projectId, followUp.projectSlug, body);
        setComposerOpen(false);
        router.refresh();
        toast.success("Project update posted");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not post the update.");
      }
    });
  };

  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-warning/15 text-warning-foreground">
          <Mail className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">
              {followUp.counterparty
                ? `Waiting on ${followUp.counterparty}`
                : "Waiting on an external response"}
            </p>
            <Badge
              variant="outline"
              className={cn(
                due && !snoozeLabel
                  ? "border-warning/30 bg-warning/15 text-warning-foreground"
                  : "text-muted-foreground"
              )}
            >
              {snoozeLabel ?? (due ? "Follow-up due" : "Waiting")}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-pretty">{followUp.summary}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {showProject ? (
              <Link href={`/projects/${followUp.projectSlug}`} className="font-medium hover:underline">
                {followUp.projectTitle}
              </Link>
            ) : null}
            {followUp.ownerName ? <span>Owner: {followUp.ownerName}</span> : <span>Unassigned</span>}
            {followUp.lastSentAt ? <span>Sent {timeAgo(followUp.lastSentAt)}</span> : null}
            <span className="inline-flex items-center gap-1">
              <Clock3 className="size-3" />
              {due ? "Due now" : dueInLabel(effectiveDue, renderedAt)}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link
            href={`/correspondence/${followUp.threadId}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Open thread <ExternalLink className="size-3.5" />
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger
              className={buttonVariants({ variant: "outline", size: "sm" })}
              disabled={pending}
            >
              Snooze <ChevronDown className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {[1, 3, 5].map((days) => (
                <DropdownMenuItem key={days} onClick={() => snooze(days)}>
                  {days} business day{days === 1 ? "" : "s"}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="sm" disabled={pending} onClick={resolve}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            Resolve
          </Button>
        </div>
      </div>

      {allowProjectUpdate ? (
        <div className="mt-3 border-t pt-3">
          {composerOpen ? (
            <div className="space-y-2">
              <Textarea
                value={updateBody}
                onChange={(event) => setUpdateBody(event.target.value)}
                rows={3}
                aria-label="Project status update"
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" disabled={pending} onClick={() => setComposerOpen(false)}>
                  Cancel
                </Button>
                <Button size="sm" disabled={pending || !updateBody.trim()} onClick={postUpdate}>
                  {pending ? <Loader2 className="size-3.5 animate-spin" /> : <MessageSquareText className="size-3.5" />}
                  Post update
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setComposerOpen(true)}>
              <MessageSquareText className="size-3.5" />
              Share as project update
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
