"use client";

import { useState } from "react";
import { ChevronLeft, Loader2, Plus, Send, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import {
  commitPlan,
  generatePlan,
  sendInterview,
} from "@/lib/ai/planner-actions";
import type { ConversationMessage, ProposedPlan } from "@/lib/ai/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function PlannerWorkspace({
  draftId,
  initialConversation,
  initialPlan,
  initialStatus,
}: {
  draftId: string;
  initialConversation: ConversationMessage[];
  initialPlan: ProposedPlan | null;
  initialStatus: string;
}) {
  const [convo, setConvo] = useState(initialConversation);
  const [plan, setPlan] = useState<ProposedPlan | null>(initialPlan);
  const [mode, setMode] = useState<"interview" | "review">(
    initialPlan ? "review" : "interview"
  );
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setConvo((c) => [...c, { role: "user", content: text }]);
    setInput("");
    setBusy(true);
    const res = await sendInterview(draftId, text);
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    setConvo((c) => [...c, { role: "assistant", content: res.reply ?? "" }]);
  }

  async function gen() {
    setBusy(true);
    const res = await generatePlan(draftId);
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    setPlan(res.plan ?? null);
    setMode("review");
  }

  if (mode === "review" && plan) {
    return (
      <PlanReview
        draftId={draftId}
        plan={plan}
        onBack={() => setMode("interview")}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">
        Plan with AI
      </h1>
      <p className="text-xs text-muted-foreground">
        Draft status: {initialStatus.replace("_", " ")}
      </p>

      <Card>
        <CardContent className="space-y-4 py-4">
          <div className="max-h-[55vh] space-y-3 overflow-y-auto">
            {convo
              .filter((m) => m.role !== "system")
              .map((m, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex",
                    m.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                      m.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary"
                    )}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
            {busy ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> thinking…
              </div>
            ) : null}
          </div>

          <div className="flex items-end gap-2 border-t pt-3">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={1}
              placeholder="Type your answer…"
              className="max-h-32 min-h-9 flex-1 resize-none"
            />
            <Button size="icon" aria-label="Send" disabled={busy} onClick={send}>
              <Send className="size-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={gen} disabled={busy}>
          <Sparkles className="size-4" />
          Generate plan
        </Button>
      </div>
    </div>
  );
}

function PlanReview({
  draftId,
  plan: initial,
  onBack,
}: {
  draftId: string;
  plan: ProposedPlan;
  onBack: () => void;
}) {
  const [plan, setPlan] = useState<ProposedPlan>(initial);
  const [unitsText, setUnitsText] = useState(
    (initial.suggestedUnits ?? []).join("\n")
  );
  const [startDate, setStartDate] = useState("");
  const [committing, setCommitting] = useState(false);

  const setPhase = (i: number, patch: Partial<ProposedPlan["phases"][number]>) =>
    setPlan((p) => ({
      ...p,
      phases: p.phases.map((ph, j) => (j === i ? { ...ph, ...patch } : ph)),
    }));
  const setTask = (
    pi: number,
    ti: number,
    patch: Partial<ProposedPlan["phases"][number]["tasks"][number]>
  ) =>
    setPlan((p) => ({
      ...p,
      phases: p.phases.map((ph, j) =>
        j === pi
          ? {
              ...ph,
              tasks: ph.tasks.map((t, k) => (k === ti ? { ...t, ...patch } : t)),
            }
          : ph
      ),
    }));
  const removePhase = (i: number) =>
    setPlan((p) => ({ ...p, phases: p.phases.filter((_, j) => j !== i) }));
  const removeTask = (pi: number, ti: number) =>
    setPlan((p) => ({
      ...p,
      phases: p.phases.map((ph, j) =>
        j === pi ? { ...ph, tasks: ph.tasks.filter((_, k) => k !== ti) } : ph
      ),
    }));
  const addTask = (pi: number) =>
    setPlan((p) => ({
      ...p,
      phases: p.phases.map((ph, j) =>
        j === pi ? { ...ph, tasks: [...ph.tasks, { name: "New task" }] } : ph
      ),
    }));
  const addPhase = () =>
    setPlan((p) => ({
      ...p,
      phases: [...p.phases, { name: "New phase", tasks: [] }],
    }));

  async function commit() {
    const units = unitsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const finalPlan: ProposedPlan = { ...plan, suggestedUnits: units };
    if (!finalPlan.projectTitle.trim()) {
      toast.error("Project title is required.");
      return;
    }
    setCommitting(true);
    try {
      await commitPlan(draftId, finalPlan, startDate || undefined);
    } catch (e) {
      // NEXT_REDIRECT is expected on success; only real errors surface.
      if (!(e as Error)?.message?.includes("NEXT_REDIRECT")) {
        toast.error("Could not create the project.");
        setCommitting(false);
      }
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Back to chat
      </button>

      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Review the plan
        </h1>
        <p className="text-muted-foreground">
          Edit anything below. Nothing is created until you commit.
        </p>
      </div>

      {(plan.assumptions?.length || plan.risks?.length) ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {plan.assumptions?.length ? (
            <Card>
              <CardContent className="space-y-2 py-4">
                <p className="text-sm font-medium">Assumptions to verify</p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {plan.assumptions.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
          {plan.risks?.length ? (
            <Card>
              <CardContent className="space-y-2 py-4">
                <p className="text-sm font-medium text-warning-foreground">
                  Risks before commit
                </p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {plan.risks.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      <Card>
        <CardContent className="grid gap-4 py-4 sm:grid-cols-2">
          <div className="grid gap-1 sm:col-span-2">
            <Label>Project title</Label>
            <Input
              value={plan.projectTitle}
              onChange={(e) =>
                setPlan((p) => ({ ...p, projectTitle: e.target.value }))
              }
            />
          </div>
          <div className="grid gap-1">
            <Label>Start date</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="grid gap-1 sm:col-span-2">
            <Label>Chapters / units (one per line)</Label>
            <Textarea
              rows={3}
              value={unitsText}
              onChange={(e) => setUnitsText(e.target.value)}
              placeholder="Chapter 1&#10;Chapter 2"
            />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {plan.phases.map((ph, pi) => (
          <Card key={pi}>
            <CardContent className="space-y-3 py-4">
              <div className="flex items-center gap-2">
                <Input
                  value={ph.name}
                  onChange={(e) => setPhase(pi, { name: e.target.value })}
                  className="font-medium"
                />
                <Input
                  type="number"
                  min="0"
                  value={ph.durationDays ?? ""}
                  onChange={(e) =>
                    setPhase(pi, {
                      durationDays: e.target.value
                        ? Number(e.target.value)
                        : undefined,
                    })
                  }
                  className="w-24"
                  placeholder="days"
                  aria-label="Duration days"
                />
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Remove phase"
                  onClick={() => removePhase(pi)}
                >
                  <X className="size-4" />
                </Button>
              </div>

              <div className="space-y-1.5 pl-1">
                {ph.tasks.map((t, ti) => (
                  <div key={ti} className="flex items-center gap-2">
                    <Input
                      value={t.name}
                      onChange={(e) => setTask(pi, ti, { name: e.target.value })}
                      className="flex-1"
                    />
                    <label className="flex items-center gap-1 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={!!t.isPerUnit}
                        onChange={(e) =>
                          setTask(pi, ti, { isPerUnit: e.target.checked })
                        }
                      />
                      per chapter
                    </label>
                    <Input
                      type="number"
                      min="0"
                      value={t.offsetDays ?? ""}
                      onChange={(e) =>
                        setTask(pi, ti, {
                          offsetDays: e.target.value
                            ? Number(e.target.value)
                            : undefined,
                        })
                      }
                      className="w-20"
                      placeholder="+days"
                      aria-label="Offset days"
                    />
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Remove task"
                      onClick={() => removeTask(pi, ti)}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => addTask(pi)}
                  className="text-muted-foreground"
                >
                  <Plus className="size-3.5" />
                  Add task
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        <Button variant="outline" size="sm" onClick={addPhase}>
          <Plus className="size-4" />
          Add phase
        </Button>
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button onClick={commit} disabled={committing}>
          {committing ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Creating…
            </>
          ) : (
            "Commit & create project"
          )}
        </Button>
      </div>
    </div>
  );
}
