"use client";

import { confirmDialog } from "@/lib/dialog-requests";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  createObligation,
  deleteObligation,
  toggleObligationActive,
} from "@/lib/obligations/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { usePropState } from "@/hooks/use-prop-state";

type Obligation = {
  id: string;
  clauseRef: string | null;
  kind: string;
  cadence: string;
  label: string;
  text: string;
  isActive: boolean;
  assigneeName: string | null;
  taskId: string | null;
  taskStatus: string | null;
  recurringTaskId: string | null;
};

const CADENCE_LABEL: Record<string, string> = {
  per_episode: "Every episode",
  per_artwork: "Per artwork",
  monthly: "Monthly report",
  quarterly: "Quarterly report",
  annual: "Annual report",
  standing: "Standing",
  on_publish: "On publish",
};

// Cadences that create a recurring reminder task (assigned to the owner).
const RECURRING_CADENCES = ["monthly", "quarterly", "annual"];

const KIND_LABEL: Record<string, string> = {
  attribution: "Attribution",
  copyright_notice: "Copyright notice",
  artwork_approval: "Artwork approval",
  analytics_report: "Analytics report",
  format_restriction: "Format restriction",
  territory_restriction: "Territory restriction",
  sample_delivery: "Sample delivery",
  other: "Other",
};

const CADENCE_ORDER = [
  "per_episode",
  "on_publish",
  "per_artwork",
  "monthly",
  "quarterly",
  "annual",
  "standing",
];

const selectClass =
  "h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring";

export function ComplianceCard({
  projectId,
  canEdit,
  obligations,
  users,
  territory,
  defaultAssigneeId,
}: {
  projectId: string;
  canEdit: boolean;
  obligations: Obligation[];
  users: { id: string; name: string }[];
  territory?: string | null;
  /** Project owner/creator — the default owner of a report reminder. */
  defaultAssigneeId?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [visibleObligations, setVisibleObligations] = usePropState(obligations);
  const [showForm, setShowForm] = useState(false);

  const [label, setLabel] = useState("");
  const [text, setText] = useState("");
  const [clauseRef, setClauseRef] = useState("");
  const [kind, setKind] = useState("other");
  const [cadence, setCadence] = useState("standing");
  const [assigneeId, setAssigneeId] = useState(defaultAssigneeId ?? "");
  const [anchorDate, setAnchorDate] = useState("");

  const isRecurring = RECURRING_CADENCES.includes(cadence);

  // Scroll into view when linked from the Overview "license obligations" badge
  // (/projects/<slug>/rights#obligations) — the page renders dynamically, so a
  // native hash jump can miss the target before it mounts.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#obligations") return;
    document
      .getElementById("obligations")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  function run(
    fn: () => Promise<{ error?: string }>,
    rollback?: () => void
  ) {
    startTransition(async () => {
      try {
        const res = await fn();
        if (res?.error) throw new Error(res.error);
        router.refresh();
      } catch (error) {
        rollback?.();
        toast.error(error instanceof Error ? error.message : "Could not save the obligation.");
      }
    });
  }

  function submit() {
    if (!label.trim() || !text.trim()) {
      toast.error("Add a label and the obligation text.");
      return;
    }
    const previous = visibleObligations;
    const draft = { label, text, clauseRef, kind, cadence, assigneeId, anchorDate };
    const temporaryId = `pending-${crypto.randomUUID()}`;
    setVisibleObligations((current) => [
      ...current,
      {
        id: temporaryId,
        clauseRef: clauseRef || null,
        kind,
        cadence,
        label,
        text,
        isActive: true,
        assigneeName: users.find((user) => user.id === assigneeId)?.name ?? null,
        taskId: null,
        taskStatus: null,
        recurringTaskId: null,
      },
    ]);
    setLabel("");
    setText("");
    setClauseRef("");
    setKind("other");
    setCadence("standing");
    setAssigneeId(defaultAssigneeId ?? "");
    setAnchorDate("");
    setShowForm(false);
    startTransition(async () => {
      try {
        const result = await createObligation(projectId, {
          label: draft.label,
          text: draft.text,
          clauseRef: draft.clauseRef || undefined,
          kind: draft.kind as never,
          cadence: draft.cadence as never,
          assigneeId: draft.assigneeId || null,
          anchorDate:
            RECURRING_CADENCES.includes(draft.cadence) && draft.anchorDate
              ? draft.anchorDate
              : undefined,
        });
        if (result.error) throw new Error(result.error);
        setVisibleObligations((current) =>
          current.map((item) =>
            item.id === temporaryId
              ? {
                  ...item,
                  id: result.id ?? temporaryId,
                  taskId: result.taskId ?? null,
                  recurringTaskId: result.recurringTaskId ?? null,
                }
              : item
          )
        );
        router.refresh();
      } catch (error) {
        setVisibleObligations(previous);
        setLabel(draft.label);
        setText(draft.text);
        setClauseRef(draft.clauseRef);
        setKind(draft.kind);
        setCadence(draft.cadence);
        setAssigneeId(draft.assigneeId);
        setAnchorDate(draft.anchorDate);
        setShowForm(true);
        toast.error(error instanceof Error ? error.message : "Could not add the obligation.");
      }
    });
  }

  const grouped = CADENCE_ORDER.map((c) => ({
    cadence: c,
    items: visibleObligations.filter((o) => o.cadence === c),
  })).filter((g) => g.items.length > 0);

  return (
    <Card id="obligations" className="scroll-mt-24">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-4 text-muted-foreground" />
          License obligations
          {visibleObligations.length > 0 ? (
            <span className="text-sm font-normal text-muted-foreground">
              ({visibleObligations.length})
            </span>
          ) : null}
        </CardTitle>
        {canEdit ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowForm((s) => !s)}
          >
            <Plus className="size-3.5" />
            Add
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Standing duties from the agreement the team must honor to stay
          compliant. Text is shown verbatim so producers apply it exactly. A
          monthly/quarterly/annual report cadence creates a recurring reminder
          task assigned to its owner (the project owner by default).
          {territory ? (
            <>
              {" "}
              Licensed territory: <span className="font-medium">{territory}</span>.
            </>
          ) : null}
        </p>

        {visibleObligations.length === 0 ? (
          <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
            No obligations recorded yet.
          </p>
        ) : (
          grouped.map((group) => (
            <div key={group.cadence} className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {CADENCE_LABEL[group.cadence] ?? group.cadence}
              </h4>
              {group.items.map((o) => (
                <div
                  key={o.id}
                  className={cn(
                    "rounded-md border p-3",
                    !o.isActive && "opacity-60"
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {o.clauseRef ? (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                        §{o.clauseRef}
                      </span>
                    ) : null}
                    <span className="text-sm font-medium">{o.label}</span>
                    <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                      {KIND_LABEL[o.kind] ?? o.kind}
                    </span>
                    {o.recurringTaskId ? (
                      <span className="rounded-full border border-info/30 bg-info/10 px-2 py-0.5 text-[11px] text-info">
                        Recurring task
                      </span>
                    ) : null}
                    {o.taskId ? (
                      <span
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-[11px]",
                          o.taskStatus === "done"
                            ? "border-success/30 bg-success/10 text-success"
                            : "border-warning/30 bg-warning/10 text-warning-foreground"
                        )}
                      >
                        {o.taskStatus === "done" ? "Approved" : "Gate task open"}
                      </span>
                    ) : null}
                    {o.assigneeName ? (
                      <span className="text-[11px] text-muted-foreground">
                        · {o.assigneeName}
                      </span>
                    ) : null}
                    {canEdit ? (
                      <div className="ml-auto flex items-center gap-1">
                        <button
                          type="button"
                          className="text-[11px] text-muted-foreground hover:text-foreground"
                          disabled={pending}
                          onClick={() => {
                            const previous = visibleObligations;
                            setVisibleObligations((current) =>
                              current.map((item) =>
                                item.id === o.id ? { ...item, isActive: !item.isActive } : item
                              )
                            );
                            run(
                              () => toggleObligationActive(o.id, !o.isActive),
                              () => setVisibleObligations(previous)
                            );
                          }}
                        >
                          {o.isActive ? "Pause" : "Resume"}
                        </button>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-destructive"
                          disabled={pending}
                          aria-label="Delete obligation"
                          onClick={async () => {
                            if (!(await confirmDialog(`Delete “${o.label}”?`))) return;
                            const previous = visibleObligations;
                            setVisibleObligations((current) =>
                              current.filter((item) => item.id !== o.id)
                            );
                            run(
                              () => deleteObligation(o.id),
                              () => setVisibleObligations(previous)
                            );
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <pre className="mt-2 whitespace-pre-wrap rounded bg-muted/60 p-2 font-sans text-sm">
                    {o.text}
                  </pre>
                </div>
              ))}
            </div>
          ))
        )}

        {showForm && canEdit ? (
          <div className="space-y-3 rounded-md border bg-muted/30 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1">
                <label className="text-xs text-muted-foreground">Label</label>
                <Input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Audio credit at the start of every episode"
                />
              </div>
              <div className="grid gap-1">
                <label className="text-xs text-muted-foreground">
                  Clause ref
                </label>
                <Input
                  value={clauseRef}
                  onChange={(e) => setClauseRef(e.target.value)}
                  placeholder="2.2"
                />
              </div>
              <div className="grid gap-1">
                <label className="text-xs text-muted-foreground">Type</label>
                <select
                  className={selectClass}
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                >
                  {Object.entries(KIND_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1">
                <label className="text-xs text-muted-foreground">Cadence</label>
                <select
                  className={selectClass}
                  value={cadence}
                  onChange={(e) => setCadence(e.target.value)}
                >
                  {Object.entries(CADENCE_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1">
                <label className="text-xs text-muted-foreground">
                  {isRecurring ? "Reminder owner" : "Owner (optional)"}
                </label>
                <select
                  className={selectClass}
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
              {isRecurring ? (
                <div className="grid gap-1">
                  <label className="text-xs text-muted-foreground">
                    First report due
                  </label>
                  <input
                    type="date"
                    className={selectClass}
                    value={anchorDate}
                    onChange={(e) => setAnchorDate(e.target.value)}
                    placeholder="a period after signing"
                  />
                  <span className="text-[11px] text-muted-foreground">
                    {cadence === "annual"
                      ? "Defaults to January 31 of the following year."
                      : "Defaults to one period after signing."}
                  </span>
                </div>
              ) : null}
            </div>
            <div className="grid gap-1">
              <label className="text-xs text-muted-foreground">
                Verbatim text
              </label>
              <Textarea
                rows={3}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste the exact contractual language…"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowForm(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={submit} disabled={pending}>
                {pending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Plus className="size-3.5" />
                )}
                Add obligation
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
