"use client";

import { confirmDialog } from "@/lib/dialog-requests";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Play, X } from "lucide-react";
import { toast } from "sonner";

import {
  addParticipant,
  addQuestion,
  deleteStandup,
  generateReportsNow,
  removeParticipant,
  removeQuestion,
  reorderQuestions,
  startNow,
  updateStandup,
} from "@/lib/standup/config-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { HelpTip } from "@/components/ui/help-tip";
import { Input } from "@/components/ui/input";
import { TimezoneControl } from "./timezone-control";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { usePropState } from "@/hooks/use-prop-state";

type Standup = {
  id: string;
  name: string;
  scheduleTime: string;
  scheduleDays: number[];
  timezone: string;
  reminderAfterMinutes: number | null;
  reportToUserId: string | null;
  isActive: boolean;
};
type Q = { id: string; prompt: string };
type P = { id: string; userId: string; userName: string };
type U = { id: string; name: string };

const DAYS = [
  { v: 1, l: "Mon" },
  { v: 2, l: "Tue" },
  { v: 3, l: "Wed" },
  { v: 4, l: "Thu" },
  { v: 5, l: "Fri" },
  { v: 6, l: "Sat" },
  { v: 0, l: "Sun" },
];
const selectClass =
  "h-9 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function StandupEditor({
  standup,
  questions: initialQuestions,
  participants: initialParticipants,
  users,
}: {
  standup: Standup;
  questions: Q[];
  participants: P[];
  users: U[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [newQ, setNewQ] = useState("");
  const [addUserId, setAddUserId] = useState("");
  const [questions, setQuestions] = usePropState(initialQuestions);
  const [participants, setParticipants] = usePropState(initialParticipants);

  const qSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const onQuestionDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = questions.map((q) => q.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const next = arrayMove(questions, from, to);
    const previous = questions;
    setQuestions(next);
    start(async () => {
      try {
        await reorderQuestions(standup.id, next.map((q) => q.id));
        router.refresh();
      } catch (error) {
        setQuestions(previous);
        toast.error(error instanceof Error ? error.message : "Could not reorder questions.");
      }
    });
  };

  const run = (fn: () => Promise<unknown>, msg?: string) =>
    start(async () => {
      try {
        await fn();
        if (msg) toast.success(msg);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not update the standup.");
      }
    });

  const memberIds = new Set(participants.map((p) => p.userId));
  const addable = users.filter((u) => !memberIds.has(u.id));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-xl font-semibold">{standup.name}</h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => run(() => startNow(standup.id), "Standup started")}
          >
            <Play className="size-4" />
            Start now
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() =>
              run(() => generateReportsNow(), "Report generated (if ready)")
            }
          >
            Generate report
          </Button>
        </div>
      </div>

      {/* Schedule */}
      <Card>
        <CardContent className="py-4">
          <form onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); run(() => updateStandup(standup.id, form), "Check-in schedule saved"); }} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1">
                <Label htmlFor="scheduleTime">Time</Label>
                <Input id="scheduleTime" name="scheduleTime" type="time" defaultValue={standup.scheduleTime} />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="timezone">Timezone</Label>
                <TimezoneControl id="timezone" defaultValue={standup.timezone} />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="reminderAfterMinutes">Reminder after (min)</Label>
                <Input
                  id="reminderAfterMinutes"
                  name="reminderAfterMinutes"
                  type="number"
                  min="0"
                  defaultValue={standup.reminderAfterMinutes ?? ""}
                  placeholder="off"
                />
              </div>
            </div>
            <div className="grid gap-1">
              <Label>Days</Label>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((d) => (
                  <label key={d.v} className="flex items-center gap-1 text-sm">
                    <input
                      type="checkbox"
                      name="days"
                      value={d.v}
                      defaultChecked={standup.scheduleDays.includes(d.v)}
                    />
                    {d.l}
                  </label>
                ))}
              </div>
            </div>
            <div className="grid gap-1 sm:max-w-xs">
              <Label htmlFor="reportToUserId">Report to (reviewer)</Label>
              <select
                id="reportToUserId"
                name="reportToUserId"
                className={selectClass}
                defaultValue={standup.reportToUserId ?? "none"}
              >
                <option value="none">Managers only</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked={standup.isActive}
              />
              Active
            </label>
            <Button type="submit" disabled={pending} size="sm">
              Save schedule
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Questions */}
      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          Questions
          <HelpTip title="Standup questions" side="right" align="start">
            These are asked, in order, each time the standup runs. Drag the
            handle (or use keyboard) to reorder them.
          </HelpTip>
        </p>
        <DndContext
          sensors={qSensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          onDragEnd={onQuestionDragEnd}
        >
          <SortableContext
            items={questions.map((q) => q.id)}
            strategy={verticalListSortingStrategy}
          >
            {questions.map((q, i) => (
              <SortableQuestion
                key={q.id}
                question={q}
                index={i}
                onRemove={async () => {
                  if (!(await confirmDialog("Remove this standup question?"))) return;
                  const previous = questions;
                  setQuestions((current) => current.filter((item) => item.id !== q.id));
                  run(
                    async () => {
                      try {
                        await removeQuestion(q.id, standup.id);
                      } catch (error) {
                        setQuestions(previous);
                        throw error;
                      }
                    }
                  );
                }}
              />
            ))}
          </SortableContext>
        </DndContext>
        <div className="flex gap-2">
          <Input
            value={newQ}
            onChange={(e) => setNewQ(e.target.value)}
            placeholder="Add a question…"
          />
          <Button
            variant="outline"
            disabled={pending || !newQ.trim()}
            onClick={() => {
              const prompt = newQ.trim();
              const previous = questions;
              const temporaryId = `pending-${crypto.randomUUID()}`;
              setQuestions((current) => [...current, { id: temporaryId, prompt }]);
              setNewQ("");
              run(async () => {
                try {
                  const result = await addQuestion(standup.id, prompt);
                  if (result?.id) {
                    setQuestions((current) => current.map((question) => question.id === temporaryId ? { ...question, id: result.id as string } : question));
                  }
                } catch (error) {
                  setQuestions(previous);
                  setNewQ(prompt);
                  throw error;
                }
              });
            }}
          >
            Add
          </Button>
        </div>
      </div>

      {/* Participants */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Participants</p>
        {participants.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between gap-2 rounded-md border bg-card px-3 py-2"
          >
            <span className="text-sm">{p.userName}</span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Remove participant"
              onClick={async () => {
                if (!(await confirmDialog(`Remove ${p.userName} from this standup?`))) return;
                const previous = participants;
                setParticipants((current) => current.filter((item) => item.id !== p.id));
                run(async () => {
                  try {
                    await removeParticipant(p.id, standup.id);
                  } catch (error) {
                    setParticipants(previous);
                    throw error;
                  }
                });
              }}
            >
              <X className="size-4" />
            </Button>
          </div>
        ))}
        <div className="flex gap-2">
          <select
            className={selectClass}
            value={addUserId}
            onChange={(e) => setAddUserId(e.target.value)}
          >
            <option value="">Add person…</option>
            {addable.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            disabled={pending || !addUserId}
            onClick={() => {
              const user = users.find((item) => item.id === addUserId);
              if (!user) return;
              const previous = participants;
              const temporaryId = `pending-${crypto.randomUUID()}`;
              setParticipants((current) => [...current, { id: temporaryId, userId: user.id, userName: user.name }]);
              setAddUserId("");
              run(async () => {
                try {
                  const result = await addParticipant(standup.id, user.id);
                  if (result?.id) {
                    setParticipants((current) => current.map((participant) => participant.id === temporaryId ? { ...participant, id: result.id as string } : participant));
                  }
                } catch (error) {
                  setParticipants(previous);
                  setAddUserId(user.id);
                  throw error;
                }
              });
            }}
          >
            Add
          </Button>
        </div>
      </div>

      <div className="border-t pt-4">
        <Button
          variant="destructive"
          size="sm"
          disabled={pending}
          onClick={async () => {
            if ((await confirmDialog(`Delete standup "${standup.name}"?`)))
              run(() => deleteStandup(standup.id));
          }}
        >
          Delete standup
        </Button>
      </div>
    </div>
  );
}

function SortableQuestion({
  question,
  index,
  onRemove,
}: {
  question: Q;
  index: number;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: question.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 rounded-md border bg-card px-3 py-2",
        isDragging && "z-10 opacity-80 shadow-md"
      )}
    >
      <button
        type="button"
        aria-label="Drag to reorder question"
        className="-ml-1 cursor-grab touch-none rounded text-muted-foreground/50 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <span className="text-xs tabular-nums text-muted-foreground">
        {index + 1}.
      </span>
      <span className="flex-1 text-sm">{question.prompt}</span>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Remove question"
        onClick={onRemove}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
