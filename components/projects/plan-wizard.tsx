"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import {
  commitProjectPlan,
  extractChaptersFromDocument,
  generateProjectPlan,
} from "@/lib/projects/task-plan-actions";
import type { ProposedPlan } from "@/lib/ai/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { projectUnitTerms, type ProjectKind } from "@/lib/projects/kinds";

type Kind = ProjectKind;
type Detail = "minimal" | "standard" | "detailed";

const selectClass =
  "h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring";

export function PlanWizard({
  projectId,
  slug,
  projectTitle,
  defaultKind,
  hasDocument,
  hasTasks,
  users,
  roles,
}: {
  projectId: string;
  slug: string;
  projectTitle: string;
  defaultKind: Kind;
  hasDocument: boolean;
  hasTasks: boolean;
  users: { id: string; name: string }[];
  roles: { key: string; label: string }[];
}) {
  const router = useRouter();
  const roleLabel = useMemo(
    () => new Map(roles.map((r) => [r.key, r.label])),
    [roles]
  );

  const [kind, setKind] = useState<Kind>(defaultKind);
  const [detail, setDetail] = useState<Detail>("standard");
  const [chaptersText, setChaptersText] = useState("");
  const [instructions, setInstructions] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [plan, setPlan] = useState<ProposedPlan | null>(null);
  const [coordinators, setCoordinators] = useState<Record<string, string>>({});
  const [startDate, setStartDate] = useState("");
  const [committing, setCommitting] = useState(false);
  const units = projectUnitTerms(kind);

  const chapters = chaptersText
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);

  async function extract() {
    if (extracting) return;
    setExtracting(true);
    try {
    const res = await extractChaptersFromDocument(projectId);
    if (res.error || !res.chapters) {
      toast.error(res.error ?? "Could not read chapters.");
      return;
    }
    if (res.chapters.length === 0) {
      toast.info("No chapter list found in the document.");
      return;
    }
    setChaptersText(res.chapters.join(", "));
    } catch { toast.error("Could not read chapters. Try again or enter them manually."); } finally { setExtracting(false); }
  }

  async function generate() {
    if (generating) return;
    setGenerating(true);
    try {
    const res = await generateProjectPlan(projectId, { kind, detail, instructions });
    if (res.error || !res.plan) {
      toast.error(res.error ?? "Could not generate the plan.");
      return;
    }
    setPlan(res.plan);
    } catch { toast.error("Could not generate the plan. Your inputs are still here; try again."); } finally { setGenerating(false); }
  }

  // ── Plan editing helpers ──
  const setPhase = (i: number, patch: Partial<ProposedPlan["phases"][number]>) =>
    setPlan((p) =>
      p ? { ...p, phases: p.phases.map((ph, j) => (j === i ? { ...ph, ...patch } : ph)) } : p
    );
  const setPhasePerUnit = (i: number, on: boolean) =>
    setPlan((p) =>
      p
        ? {
            ...p,
            phases: p.phases.map((ph, j) =>
              j === i
                ? { ...ph, tasks: ph.tasks.map((t) => ({ ...t, isPerUnit: on })) }
                : ph
            ),
          }
        : p
    );
  const removePhase = (i: number) =>
    setPlan((p) => (p ? { ...p, phases: p.phases.filter((_, j) => j !== i) } : p));

  const usedRoleKeys = useMemo(
    () => Array.from(new Set((plan?.phases ?? []).map((ph) => ph.roleKey).filter(Boolean) as string[])),
    [plan]
  );

  async function commit() {
    if (!plan || committing) return;
    setCommitting(true);
    try {
      const res = await commitProjectPlan(projectId, plan, {
        kind,
        chapters,
        coordinators,
        startDate: startDate || undefined,
      });
      if (res?.error) {
        toast.error(res.error);
        setCommitting(false);
        return;
      }
      toast.success("Tasks created");
      router.push(`/projects/${slug}/tasks`);
      router.refresh();
    } catch {
      toast.error("Could not create the tasks.");
      setCommitting(false);
    }
  }

  const taskCount = (plan?.phases ?? []).reduce((sum, ph) => {
    const per = ph.tasks.some((t) => t.isPerUnit);
    return sum + ph.tasks.length * (per && chapters.length ? chapters.length : 1);
  }, 0);

  // ── Setup step ──
  if (!plan) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-5">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Set up the task plan
          </h1>
          <p className="text-muted-foreground">
            AI drafts the production pipeline for {projectTitle}. You review and
            assign coordinators before anything is created.
          </p>
        </div>

        <Card>
          <CardContent className="grid gap-4 py-4 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label>Project type</Label>
              <select
                className={selectClass}
                value={kind}
                onChange={(e) => setKind(e.target.value as Kind)}
              >
                <option value="book">Book (chapters)</option>
                <option value="article">Article collection</option>
                <option value="podcast">Podcast (episodes)</option>
                <option value="video_series">Video series (videos)</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="grid gap-1">
              <Label>How detailed?</Label>
              <select
                className={selectClass}
                value={detail}
                onChange={(e) => setDetail(e.target.value as Detail)}
              >
                <option value="minimal">Minimal — one task per stage</option>
                <option value="standard">Standard — per-chapter core stages</option>
                <option value="detailed">Detailed — per-chapter everywhere</option>
              </select>
            </div>
            <div className="grid gap-1 sm:col-span-2">
              <div className="flex items-center justify-between">
                <Label>
                  {units.plural[0].toUpperCase() + units.plural.slice(1)}{" "}
                  {kind === "other" ? "(optional)" : ""}
                </Label>
                {hasDocument ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={extracting}
                    onClick={extract}
                    className="text-muted-foreground"
                  >
                    {extracting ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="size-3.5" />
                    )}
                    Extract from document
                  </Button>
                ) : null}
              </div>
              <Textarea
                rows={3}
                value={chaptersText}
                onChange={(e) => setChaptersText(e.target.value)}
                placeholder={
                  kind === "article"
                    ? "Why Scripture Matters, How to Read the Psalms"
                    : kind === "podcast"
                      ? "Episode 1, Episode 2"
                      : kind === "video_series"
                        ? "Video 1, Video 2"
                        : "Introduction, Chapter 1, Chapter 2, Conclusion"
                }
              />
              <p className="text-xs text-muted-foreground">
                Comma- or line-separated. {chapters.length}{" "}
                {units.singular}
                {chapters.length === 1 ? "" : "s"}.
              </p>
            </div>
            <div className="grid gap-1 sm:col-span-2">
              <Label>Anything special? (optional)</Label>
              <Textarea
                rows={2}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="e.g. skip printing, add a study-guide stage…"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={generate} disabled={generating}>
            {generating ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Designing the plan…
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                Generate plan
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // ── Review step ──
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Review the plan
        </h1>
        <p className="text-muted-foreground">
          {plan.phases.length} stages · {chapters.length} {units.plural} · ~{taskCount}{" "}
          tasks. Edit anything; nothing is created until you confirm.
        </p>
      </div>

      {hasTasks ? (
        <Card>
          <CardContent className="py-3 text-sm text-warning">
            This project already has tasks — these stages will be added after the
            existing ones.
          </CardContent>
        </Card>
      ) : null}

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
                <p className="text-sm font-medium text-warning-text">
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

      {/* Stages */}
      <div className="space-y-2">
        {plan.phases.map((ph, i) => (
          <Card key={i}>
            <CardContent className="flex flex-wrap items-center gap-2 py-3">
              <Input
                value={ph.name}
                onChange={(e) => setPhase(i, { name: e.target.value })}
                className="h-8 min-w-40 flex-1 font-medium"
              />
              <select
                className={selectClass + " h-8"}
                value={ph.roleKey ?? ""}
                onChange={(e) => setPhase(i, { roleKey: e.target.value || undefined })}
                aria-label="Coordinator role"
              >
                <option value="">— role —</option>
                {roles.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
              <Input
                type="number"
                min="0"
                value={ph.durationDays ?? ""}
                onChange={(e) =>
                  setPhase(i, {
                    durationDays: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                className="h-8 w-20"
                placeholder="days"
                aria-label="Duration days"
              />
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={ph.tasks.some((t) => t.isPerUnit)}
                  onChange={(e) => setPhasePerUnit(i, e.target.checked)}
                />
                per {units.singular}
              </label>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Remove stage"
                onClick={() => removePhase(i)}
              >
                <X className="size-4" />
              </Button>
            </CardContent>
          </Card>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setPlan((p) =>
              p
                ? {
                    ...p,
                    phases: [
                      ...p.phases,
                      { name: "New stage", roleKey: undefined, durationDays: 7, tasks: [{ name: "New stage" }] },
                    ],
                  }
                : p
            )
          }
        >
          <Plus className="size-4" />
          Add stage
        </Button>
      </div>

      {/* Coordinators */}
      <Card>
        <CardContent className="space-y-2 py-4">
          <p className="text-sm font-medium">Assign a coordinator per stage</p>
          {usedRoleKeys.length === 0 ? (
            <p className="text-sm text-muted-foreground">No roles on the stages yet.</p>
          ) : (
            usedRoleKeys.map((rk) => (
              <div key={rk} className="flex items-center gap-3">
                <span className="w-56 shrink-0 text-sm">{roleLabel.get(rk) ?? rk}</span>
                <select
                  className={selectClass + " flex-1"}
                  value={coordinators[rk] ?? ""}
                  onChange={(e) =>
                    setCoordinators((c) => ({ ...c, [rk]: e.target.value }))
                  }
                >
                  <option value="">— unassigned —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 py-4">
          <Label className="text-sm">Start date</Label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="h-8 w-44"
          />
          <span className="text-xs text-muted-foreground">
            Defaults to the project start; due dates cascade from here.
          </span>
        </CardContent>
      </Card>

      <div className="flex justify-between gap-2 border-t pt-4">
        <Button variant="ghost" onClick={() => setPlan(null)} disabled={committing}>
          Back
        </Button>
        <Button onClick={commit} disabled={committing}>
          {committing ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Creating…
            </>
          ) : (
            `Create ~${taskCount} tasks`
          )}
        </Button>
      </div>
    </div>
  );
}
