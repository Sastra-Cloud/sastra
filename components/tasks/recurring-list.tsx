"use client";

import { confirmDialog } from "@/lib/dialog-requests";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarClock,
  Pause,
  Pencil,
  Play,
  Repeat2,
  Trash2,
} from "lucide-react";

import {
  deleteRecurringTask,
  setRecurringTaskActive,
  updateRecurringTask,
} from "@/lib/tasks/recurring-actions";
import type { RecurringTaskRow } from "@/lib/tasks/queries";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePropState } from "@/hooks/use-prop-state";

const FREQ_LABEL: Record<string, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annually",
};

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

type Assignee = { id: string; name: string };

export function RecurringList({
  rules,
  assignees,
  canManage,
}: {
  rules: RecurringTaskRow[];
  assignees: Assignee[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [visibleRules, setVisibleRules] = usePropState(rules);
  const [editing, setEditing] = useState<RecurringTaskRow | null>(null);

  if (visibleRules.length === 0) return null;

  const run = (fn: () => Promise<unknown>, msg: string, rollback?: () => void) =>
    start(async () => {
      try {
        const result = await fn();
        if (result && typeof result === "object" && "error" in result && result.error) {
          throw new Error(String(result.error));
        }
        router.refresh();
      } catch (error) {
        rollback?.();
        toast.error(error instanceof Error ? error.message : msg);
      }
    });

  function toggleRule(rule: RecurringTaskRow) {
    const previous = visibleRules;
    setVisibleRules((current) =>
      current.map((item) =>
        item.id === rule.id ? { ...item, isActive: !item.isActive } : item
      )
    );
    run(
      () => setRecurringTaskActive(rule.id, !rule.isActive),
      "Couldn't update the recurring task",
      () => setVisibleRules(previous)
    );
  }

  function removeRule(rule: RecurringTaskRow) {
    const previous = visibleRules;
    setVisibleRules((current) => current.filter((item) => item.id !== rule.id));
    run(
      () => deleteRecurringTask(rule.id),
      "Couldn't delete the recurring task",
      () => setVisibleRules(previous)
    );
  }

  return (
    <>
      <section aria-labelledby="recurring-schedules-heading" className="space-y-3 pt-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Repeat2 className="size-4 text-info" />
              <h2 id="recurring-schedules-heading" className="text-sm font-semibold">
                Recurring tasks
              </h2>
              <Badge variant="secondary" className="tabular-nums">
                {visibleRules.length}
              </Badge>
            </div>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
              Schedules that create future tasks automatically. Active work appears
              on the board above.
            </p>
          </div>
          {canManage ? (
            <p className="text-xs text-muted-foreground">
              Edit a schedule to correct future occurrences.
            </p>
          ) : null}
        </div>

        <ul className="divide-y overflow-hidden rounded-lg border bg-card/60">
          {visibleRules.map((rule) => (
            <li
              key={rule.id}
              className="grid gap-3 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-4"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="text-sm font-medium leading-snug">{rule.title}</p>
                  {rule.sourceObligationId ? (
                    <Badge variant="outline">
                      License obligation
                      {rule.sourceClauseRef ? ` §${rule.sourceClauseRef}` : ""}
                    </Badge>
                  ) : null}
                  {!rule.isActive ? (
                    <Badge variant="secondary">Paused</Badge>
                  ) : null}
                </div>
                {rule.description ? (
                  <p className="mt-1 line-clamp-2 max-w-3xl text-xs leading-relaxed text-muted-foreground">
                    {rule.description}
                  </p>
                ) : null}
                <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                  <CalendarClock className="size-3.5" />
                  {rule.isActive && rule.nextDue ? (
                    <span className="font-medium text-foreground/80">
                      Next {formatDate(rule.nextDue)}
                    </span>
                  ) : (
                    <span>Not generating tasks</span>
                  )}
                  <span aria-hidden>·</span>
                  <span>{FREQ_LABEL[rule.frequency] ?? rule.frequency}</span>
                  <span aria-hidden>·</span>
                  <span>{rule.assigneeName ?? "Unassigned"}</span>
                </p>
              </div>
              {canManage ? (
                <div className="flex min-h-9 shrink-0 flex-wrap items-center gap-1 sm:justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => setEditing(rule)}
                  >
                    <Pencil className="size-3.5" />
                    Edit schedule
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      toggleRule(rule)
                    }
                  >
                    {rule.isActive ? (
                      <>
                        <Pause className="size-3.5" />
                        Pause
                      </>
                    ) : (
                      <>
                        <Play className="size-3.5" />
                        Resume
                      </>
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete recurring task ${rule.title}`}
                    disabled={pending}
                    onClick={async () => {
                      if (
                        !(await confirmDialog(`Delete recurring schedule "${rule.title}" and its unfinished occurrences?`))
                      ) {
                        return;
                      }
                      removeRule(rule);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {editing ? (
        <RecurringTaskEditDialog
          key={editing.id}
          rule={editing}
          assignees={assignees}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}

function RecurringTaskEditDialog({
  rule,
  assignees,
  onClose,
}: {
  rule: RecurringTaskRow;
  assignees: Assignee[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [saving, startSaving] = useTransition();
  const [title, setTitle] = useState(rule.title);
  const [description, setDescription] = useState(rule.description ?? "");
  const [frequency, setFrequency] = useState(rule.frequency);
  const [anchorDate, setAnchorDate] = useState(rule.anchorDate);
  const [endDate, setEndDate] = useState(rule.endDate ?? "");
  const [assigneeId, setAssigneeId] = useState(rule.assigneeId ?? "");
  const [priority, setPriority] = useState(rule.priority);
  const frequencyOptions = rule.sourceObligationId
    ? ["monthly", "quarterly", "annual"]
    : ["weekly", "monthly", "quarterly", "annual"];

  function save() {
    startSaving(async () => {
      try {
        const result = await updateRecurringTask(rule.id, {
          title,
          description: description.trim() || null,
          frequency: frequency as "weekly" | "monthly" | "quarterly" | "annual",
          anchorDate,
          endDate: endDate || null,
          assigneeId: assigneeId || null,
          priority: priority as "low" | "medium" | "high" | "urgent",
        });
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.success("Recurring schedule updated");
        router.refresh();
        onClose();
      } catch {
        toast.error("Couldn't update the recurring schedule");
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit recurring schedule</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          {rule.sourceObligationId ? (
            <p className="rounded-lg border border-info/30 bg-info/10 px-3 py-2 text-xs text-muted-foreground">
              This schedule comes from a license obligation. Correcting its
              title, requirement, cadence, first due date, or owner also updates
              the obligation on the Rights tab.
            </p>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor="recurring-title">Title</Label>
            <Input
              id="recurring-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="recurring-description">
              {rule.sourceObligationId
                ? "Agreement requirement"
                : "Description"}
            </Label>
            <Textarea
              id="recurring-description"
              rows={5}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="recurring-frequency">Repeats</Label>
              <select
                id="recurring-frequency"
                className={selectClass}
                value={frequency}
                onChange={(event) => setFrequency(event.target.value)}
              >
                {frequencyOptions.map((value) => (
                  <option key={value} value={value}>
                    {FREQ_LABEL[value]}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="recurring-priority">Priority</Label>
              <select
                id="recurring-priority"
                className={selectClass}
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="recurring-anchor">First due</Label>
              <Input
                id="recurring-anchor"
                type="date"
                value={anchorDate}
                onChange={(event) => setAnchorDate(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="recurring-end">Ends (optional)</Label>
              <Input
                id="recurring-end"
                type="date"
                min={anchorDate}
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="recurring-assignee">Owner</Label>
              <select
                id="recurring-assignee"
                className={selectClass}
                value={assigneeId}
                onChange={(event) => setAssigneeId(event.target.value)}
              >
                <option value="">Unassigned</option>
                {assignees.map((assignee) => (
                  <option key={assignee.id} value={assignee.id}>
                    {assignee.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !title.trim() || !anchorDate}>
            {saving ? "Saving…" : "Save schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
