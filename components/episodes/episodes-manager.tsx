"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  ExternalLink,
  FilterX,
  Loader2,
  Plus,
  Settings2,
  Sparkles,
  UserRound,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { usePropState } from "@/hooks/use-prop-state";

import {
  bulkCreateEpisodes,
  bulkUpdateEpisodes,
  repairPodcastWorkflows,
  setEpisodeOwner,
  setEpisodeSchedule,
  setEpisodeStageAssignee,
  setEpisodeStageDueDate,
  setEpisodeStageStatus,
  setEpisodeStatus,
  setEpisodeVideoRequirement,
  updatePodcastWorkflowSettings,
  type EpisodeBulkOperation,
} from "@/lib/episodes/actions";
import type {
  EpisodeData,
  EpisodeProductionRow,
  EpisodeStageTask,
} from "@/lib/episodes/queries";
import {
  AUDIO_STAGES,
  ALL_BULK_PRODUCTION_STATUSES,
  deriveEpisodeProductionStatus,
  PODCAST_STAGE_META,
  requiredStages,
  stageOffsetsFollowSequence,
  trackProgress,
  TRANSLATION_STAGES,
  ORIGINAL_VIDEO_EDITORIAL_STAGES,
  VIDEO_STAGES,
  type BulkProductionStatus,
  type PodcastStage,
  type PodcastTaskStatus,
} from "@/lib/episodes/workflow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type BulkKind =
  | "owner"
  | "production_status"
  | "stage_assignee"
  | "assign_defaults"
  | "target_date"
  | "date_cadence"
  | "video";

const selectClass =
  "h-8 min-w-0 rounded-lg border border-input bg-background px-2 text-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-50 dark:bg-input/30";

const taskStatusLabels: Record<PodcastTaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  review: "Review",
  done: "Done",
};

const productionTone: Record<string, string> = {
  "Setup incomplete": "border-destructive/30 bg-destructive/10 text-destructive",
  "Not started": "border-border bg-muted/50 text-muted-foreground",
  Published: "border-success/30 bg-success/10 text-success",
  Scheduled: "border-info/30 bg-info/10 text-info",
  "Ready to schedule": "border-success/30 bg-success/10 text-success",
  Translating: "border-warning/30 bg-warning/10 text-warning-foreground",
  "Reviewing translation": "border-warning/30 bg-warning/10 text-warning-foreground",
};

function ProgressCell({
  label,
  progress,
  setupIncomplete = false,
}: {
  label: string;
  progress: { complete: number; total: number; percent: number } | null;
  setupIncomplete?: boolean;
}) {
  if (setupIncomplete) {
    return <span className="text-xs font-medium text-destructive">Setup needed</span>;
  }
  if (!progress) {
    return <span className="text-xs text-muted-foreground">Not required</span>;
  }
  return (
    <div className="w-24 space-y-1" aria-label={`${label} ${progress.percent}% complete`}>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{progress.complete}/{progress.total}</span>
        <span>{progress.percent}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-foreground/70 transition-[width]"
          style={{ width: `${progress.percent}%` }}
        />
      </div>
    </div>
  );
}

function ProductionBadge({ status }: { status: string }) {
  const ready = status === "Ready to schedule" || status === "Published";
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 font-medium",
        productionTone[status] ?? "border-border bg-muted/50 text-foreground"
      )}
    >
      {status === "Setup incomplete" ? (
        <AlertTriangle className="size-3" />
      ) : ready ? (
        <Check className="size-3" />
      ) : (
        <CircleDashed className="size-3" />
      )}
      {status}
    </Badge>
  );
}

function Readiness({ episode }: { episode: EpisodeProductionRow }) {
  if (!episode.workflowComplete) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
        <AlertTriangle className="size-3.5" /> {episode.missingStageCount} tasks missing
      </span>
    );
  }
  if (episode.overdueCount > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
        <AlertTriangle className="size-3.5" /> {episode.overdueCount} overdue
      </span>
    );
  }
  if (episode.unassignedCount > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-warning-foreground">
        <UserRound className="size-3.5" /> {episode.unassignedCount} unassigned
      </span>
    );
  }
  if (episode.blockedCount > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <CircleDashed className="size-3.5" /> {episode.blockedCount} waiting
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-success">
      <Check className="size-3.5" /> On track
    </span>
  );
}

export function EpisodesManager({
  projectId,
  projectSlug,
  projectTitle,
  canEdit,
  currentUserId,
  data: initialData,
}: {
  projectId: string;
  projectSlug: string;
  projectTitle: string;
  canEdit: boolean;
  currentUserId: string;
  data: EpisodeData;
}) {
  const router = useRouter();
  const [data, setData] = usePropState(initialData);
  const [pending, startTransition] = useTransition();
  const [bulkCount, setBulkCount] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const lastSelectedIndex = useRef<number | null>(null);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [attentionFilter, setAttentionFilter] = useState("all");
  const [videoFilter, setVideoFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [bulkKind, setBulkKind] = useState<BulkKind>("owner");
  const [bulkUser, setBulkUser] = useState("");
  const [bulkStage, setBulkStage] = useState<PodcastStage>(
    () => initialData.workflowStages[0] ?? "translate_script"
  );
  const [bulkProductionStatus, setBulkProductionStatus] =
    useState<BulkProductionStatus>("Not started");
  const [bulkDate, setBulkDate] = useState("");
  const [cadenceDays, setCadenceDays] = useState("7");
  const [bulkVideo, setBulkVideo] = useState("inherit");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isVideoSeries = data.projectKind === "video_series";
  const unitSingular = isVideoSeries ? "video" : "episode";
  const unitPlural = isVideoSeries ? "videos" : "episodes";
  const bulkStatuses = ALL_BULK_PRODUCTION_STATUSES.filter((status) => {
    const original = [
      "Developing concept",
      "Ready to write script",
      "Writing script",
      "Ready for script review",
      "Reviewing script",
    ];
    const translation = [
      "Translating",
      "Ready for translation review",
      "Reviewing translation",
    ];
    const audio = [
      "Ready to record",
      "Recording audio",
      "Ready for audio mastering",
      "Mastering audio",
    ];
    if (isVideoSeries) {
      return data.videoProductionMode === "original"
        ? !translation.includes(status) && !audio.includes(status)
        : !original.includes(status) && !audio.includes(status);
    }
    return !original.includes(status);
  });

  const statuses = useMemo(
    () => [...new Set(data.episodes.map((episode) => episode.productionStatus))],
    [data.episodes]
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return data.episodes.filter((episode) => {
      if (needle && !episode.name.toLocaleLowerCase().includes(needle)) return false;
      if (statusFilter !== "all" && episode.productionStatus !== statusFilter) return false;
      if (ownerFilter === "unassigned" && episode.ownerId) return false;
      if (ownerFilter !== "all" && ownerFilter !== "unassigned" && episode.ownerId !== ownerFilter) return false;
      if (
        assigneeFilter !== "all" &&
        !episode.tasks.some((task) => task.assignedTo === assigneeFilter)
      ) return false;
      if (attentionFilter === "overdue" && episode.overdueCount === 0) return false;
      if (attentionFilter === "unassigned" && episode.unassignedCount === 0) return false;
      if (videoFilter === "required" && !episode.videoRequired) return false;
      if (videoFilter === "skipped" && episode.videoRequired) return false;
      if (dateFrom && (!episode.scheduledDate || episode.scheduledDate < dateFrom)) return false;
      if (dateTo && (!episode.scheduledDate || episode.scheduledDate > dateTo)) return false;
      return true;
    });
  }, [
    assigneeFilter,
    attentionFilter,
    data.episodes,
    dateFrom,
    dateTo,
    ownerFilter,
    query,
    statusFilter,
    videoFilter,
  ]);

  const selectedIds = [...selected];
  const protectedProductionSelectionCount = data.episodes.filter(
    (episode) =>
      selected.has(episode.id) && episode.publishingStatus !== "draft"
  ).length;
  const productionSelectionCount =
    selected.size - protectedProductionSelectionCount;
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((episode) => selected.has(episode.id));
  const filtersActive = Boolean(
    query ||
      statusFilter !== "all" ||
      ownerFilter !== "all" ||
      assigneeFilter !== "all" ||
      attentionFilter !== "all" ||
      videoFilter !== "all" ||
      dateFrom ||
      dateTo
  );

  const barMax = Math.max(
    ...data.milestones.map((milestone) => milestone.n),
    data.total,
    1
  );
  const pctPublished = Math.min(100, (data.publishedCount / barMax) * 100);

  function run(
    action: () => Promise<{ error?: string }>,
    successMessage?: string,
    mutation?: EpisodeMutation
  ) {
    const previous = data;
    if (mutation) setData((current) => applyEpisodeMutation(current, mutation));
    startTransition(async () => {
      try {
        const result = await action();
        if (result?.error) {
          if (mutation) setData(previous);
          toast.error(result.error);
          return;
        }
        if (successMessage) toast.success(successMessage);
        router.refresh();
      } catch (error) {
        if (mutation) setData(previous);
        toast.error(error instanceof Error ? error.message : "Update failed.");
      }
    });
  }

  function toggleExpanded(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelection(id: string, index: number, checked: boolean, shift: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (shift && lastSelectedIndex.current != null) {
        const start = Math.min(lastSelectedIndex.current, index);
        const end = Math.max(lastSelectedIndex.current, index);
        for (let i = start; i <= end; i += 1) {
          if (checked) next.add(filtered[i].id);
          else next.delete(filtered[i].id);
        }
      } else if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
    lastSelectedIndex.current = index;
  }

  function clearFilters() {
    setQuery("");
    setStatusFilter("all");
    setOwnerFilter("all");
    setAssigneeFilter("all");
    setAttentionFilter("all");
    setVideoFilter("all");
    setDateFrom("");
    setDateTo("");
  }

  function addEpisodes() {
    const count = Number.parseInt(bulkCount, 10);
    if (!Number.isFinite(count) || count < 1) {
      toast.error(`Enter how many ${unitPlural} to add.`);
      return;
    }
    run(
      () => bulkCreateEpisodes(projectId, { count }),
      `Added ${count} ${unitPlural} with production tasks.`
    );
    setBulkCount("");
  }

  function buildBulkOperation(): EpisodeBulkOperation | null {
    if (bulkKind === "owner") {
      return { kind: "owner", ownerId: bulkUser || null };
    }
    if (bulkKind === "production_status") {
      return { kind: "production_status", status: bulkProductionStatus };
    }
    if (bulkKind === "stage_assignee") {
      return { kind: "stage_assignee", stage: bulkStage, assigneeId: bulkUser || null };
    }
    if (bulkKind === "assign_defaults") return { kind: "assign_defaults" };
    if (bulkKind === "target_date") {
      if (!bulkDate) return null;
      return { kind: "target_date", date: bulkDate };
    }
    if (bulkKind === "date_cadence") {
      if (!bulkDate) return null;
      return {
        kind: "date_cadence",
        startDate: bulkDate,
        intervalDays: Number.parseInt(cadenceDays, 10) || 7,
      };
    }
    return {
      kind: "video",
      value: bulkVideo === "inherit" ? null : bulkVideo === "required",
    };
  }

  function applyBulkOperation() {
    const operation = buildBulkOperation();
    if (!operation) {
      toast.error("Complete the bulk update details first.");
      return;
    }
    setConfirmOpen(false);
    startTransition(async () => {
      try {
        const result = await bulkUpdateEpisodes(projectId, selectedIds, operation);
        if (result.failed.length > 0) {
          toast.warning(
            `Updated ${result.succeeded} episodes; ${result.failed.length} failed. ${result.failed[0].error}`
          );
        } else {
          toast.success(
            `Updated ${result.succeeded} episodes and ${result.affectedTaskCount} production tasks.`
          );
        }
        setSelected(new Set());
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Bulk update failed.");
      }
    });
  }

  return (
    <div className="space-y-4 pb-24">
      <section className="overflow-hidden rounded-2xl border bg-card">
        <div className="grid gap-5 p-5 lg:grid-cols-[1.4fr_1fr] lg:p-6">
          <div>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="mb-1 text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
                  Production ledger
                </p>
                <h1 className="font-heading text-xl font-semibold tracking-tight">
                  {projectTitle} {unitPlural}
                </h1>
              </div>
              {canEdit ? (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
                    <Settings2 /> Workflow
                  </Button>
                  <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-1">
                    <Input
                      type="number"
                      min={1}
                      max={500}
                      value={bulkCount}
                      onChange={(event) => setBulkCount(event.target.value)}
                      placeholder="Count"
                      aria-label={`Number of ${unitPlural} to add`}
                      className="h-7 w-20 border-0 bg-transparent shadow-none"
                    />
                    <Button size="xs" variant="secondary" onClick={addEpisodes} disabled={pending}>
                      <Plus /> Add
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="relative mb-2 h-3 overflow-visible rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-success transition-[width]"
                style={{ width: `${pctPublished}%` }}
              />
              {data.milestones.map((milestone) => (
                <span
                  key={milestone.n}
                  className={cn(
                    "absolute top-1/2 h-5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full",
                    milestone.reached ? "bg-success" : "bg-muted-foreground/50"
                  )}
                  style={{ left: `${Math.min(100, (milestone.n / barMax) * 100)}%` }}
                  title={`${milestone.n}-episode milestone`}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>{data.publishedCount} published of {data.total}</span>
              {data.milestones.map((milestone) => (
                <span key={milestone.n} className={milestone.reached ? "font-medium text-success" : undefined}>
                  {milestone.reached ? "✓ " : ""}{milestone.n}-episode milestone
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
            {[
              [data.setupNeededCount, "Setup needed"],
              [data.notStartedCount, "Not started"],
              [data.inProductionCount, "In production"],
              [data.readyCount, "Ready"],
              [data.overdueCount, "Overdue"],
              [data.unassignedCount, "Unassigned"],
            ].map(([value, label]) => (
              <div key={label} className="bg-card px-3 py-3">
                <p className="text-xl font-semibold tabular-nums">{value}</p>
                <p className="text-[11px] text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {data.setupNeededCount > 0 ? (
        <div className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
            <div>
              <p className="text-sm font-medium">Production tracking is incomplete</p>
              <p className="text-xs text-muted-foreground">
                {data.setupNeededCount} {unitSingular}{data.setupNeededCount === 1 ? " is" : "s are"} missing standard production tasks. Progress and assignments are not reliable until those tasks exist.
              </p>
            </div>
          </div>
          {canEdit ? (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() =>
                run(
                  () => repairPodcastWorkflows(projectId),
                  "Missing production tasks created."
                )
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : <Settings2 />}
              Repair tracking
            </Button>
          ) : null}
        </div>
      ) : null}

      <Card>
        <CardContent className="space-y-3 p-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(180px,1.4fr)_repeat(5,minmax(120px,1fr))_auto]">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Find a ${unitSingular}…`}
              aria-label={`Filter ${unitPlural} by title`}
              className="h-8"
            />
            <select className={selectClass} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Current production step filter">
              <option value="all">All steps</option>
              {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <select className={selectClass} value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)} aria-label="Episode owner filter">
              <option value="all">All owners</option>
              <option value="unassigned">No owner</option>
              {data.assignableUsers.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
            <select className={selectClass} value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)} aria-label="Production task assignee filter">
              <option value="all">All assignees</option>
              {data.assignableUsers.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
            <select className={selectClass} value={attentionFilter} onChange={(event) => setAttentionFilter(event.target.value)} aria-label="Attention filter">
              <option value="all">Any attention</option>
              <option value="overdue">Overdue</option>
              <option value="unassigned">Unassigned</option>
            </select>
            {!isVideoSeries ? <select className={selectClass} value={videoFilter} onChange={(event) => setVideoFilter(event.target.value)} aria-label="Video requirement filter">
              <option value="all">Any video policy</option>
              <option value="required">Video required</option>
              <option value="skipped">Video skipped</option>
            </select> : null}
            <Button variant="ghost" size="xs" disabled={!filtersActive} onClick={clearFilters}>
              <FilterX /> Clear
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <CalendarDays className="size-3.5" /> Publication window
            <input type="date" className={selectClass} value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} aria-label="Publication date from" />
            <span>to</span>
            <input type="date" className={selectClass} value={dateTo} onChange={(event) => setDateTo(event.target.value)} aria-label="Publication date to" />
            <span className="ml-auto tabular-nums">{filtered.length} of {data.total} {unitPlural}</span>
          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <Sparkles className="size-6 text-muted-foreground" />
            <p className="font-medium">No {unitPlural} match these filters</p>
            <Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1100px] border-collapse text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="w-10 px-3 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={(event) => {
                        setSelected((current) => {
                          const next = new Set(current);
                          for (const episode of filtered) {
                            if (event.target.checked) next.add(episode.id);
                            else next.delete(episode.id);
                          }
                          return next;
                        });
                      }}
                      className="size-4 accent-primary"
                      aria-label="Select all filtered episodes"
                    />
                  </th>
                  <th className="px-2 py-3 text-left font-medium">{unitSingular[0].toUpperCase() + unitSingular.slice(1)}</th>
                  <th className="px-2 py-3 text-left font-medium">Current step</th>
                  <th className="px-2 py-3 text-left font-medium">Owner</th>
                  <th className="px-2 py-3 text-left font-medium">{data.editorialLabel}</th>
                  {!isVideoSeries ? <th className="px-2 py-3 text-left font-medium">Audio</th> : null}
                  <th className="px-2 py-3 text-left font-medium">Video</th>
                  <th className="px-2 py-3 text-left font-medium">Target</th>
                  <th className="px-3 py-3 text-left font-medium">Readiness</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((episode, index) => (
                  <EpisodeTableRows
                    key={episode.id}
                    episode={episode}
                    index={index}
                    expanded={expanded.has(episode.id)}
                    selected={selected.has(episode.id)}
                    canEdit={canEdit}
                    currentUserId={currentUserId}
                    users={data.assignableUsers}
                    projectSlug={projectSlug}
                    pending={pending}
                    onToggleExpand={() => toggleExpanded(episode.id)}
                    onSelect={(checked, shift) => toggleSelection(episode.id, index, checked, shift)}
                    run={run}
                    workflow={data}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y md:hidden">
            <div className="flex items-center justify-between bg-muted/40 px-4 py-3 text-xs">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={(event) => {
                    setSelected((current) => {
                      const next = new Set(current);
                      for (const episode of filtered) {
                        if (event.target.checked) next.add(episode.id);
                        else next.delete(episode.id);
                      }
                      return next;
                    });
                  }}
                  className="size-4 accent-primary"
                />
                Select filtered
              </label>
              <span className="text-muted-foreground">{filtered.length} {unitPlural}</span>
            </div>
            {filtered.map((episode, index) => (
              <EpisodeMobileCard
                key={episode.id}
                episode={episode}
                index={index}
                expanded={expanded.has(episode.id)}
                selected={selected.has(episode.id)}
                canEdit={canEdit}
                currentUserId={currentUserId}
                users={data.assignableUsers}
                projectSlug={projectSlug}
                pending={pending}
                onToggleExpand={() => toggleExpanded(episode.id)}
                onSelect={(checked, shift) => toggleSelection(episode.id, index, checked, shift)}
                run={run}
                workflow={data}
              />
            ))}
          </div>
        </div>
      )}

      {canEdit && selected.size > 0 ? (
        <div className="fixed inset-x-3 bottom-20 z-40 mx-auto max-w-6xl rounded-2xl border bg-popover/95 p-3 shadow-2xl backdrop-blur md:bottom-5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-1 flex items-center gap-2 border-r pr-3">
              <span className="grid size-7 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{selected.size}</span>
              <span className="hidden text-sm font-medium sm:inline">selected</span>
              <Button variant="ghost" size="xs" onClick={() => setSelected(new Set())}>Clear</Button>
            </div>
            <select className={selectClass} value={bulkKind} onChange={(event) => setBulkKind(event.target.value as BulkKind)} aria-label="Bulk operation">
              <option value="owner">Assign owner</option>
              <option value="production_status">Move production to</option>
              <option value="stage_assignee">Assign a work step</option>
              <option value="assign_defaults">Fill from defaults</option>
              <option value="target_date">Set target date</option>
              <option value="date_cadence">Set date cadence</option>
              {!isVideoSeries ? <option value="video">Video requirement</option> : null}
            </select>

            {bulkKind === "stage_assignee" ? (
              <StageSelect value={bulkStage} onChange={setBulkStage} stages={data.workflowStages} />
            ) : null}
            {bulkKind === "owner" || bulkKind === "stage_assignee" ? (
              <PersonSelect value={bulkUser} onChange={setBulkUser} users={data.assignableUsers} emptyLabel="Unassigned" />
            ) : null}
            {bulkKind === "production_status" ? (
              <select
                className={selectClass}
                value={bulkProductionStatus}
                onChange={(event) =>
                  setBulkProductionStatus(
                    event.target.value as BulkProductionStatus
                  )
                }
                aria-label="Current production step"
              >
                {bulkStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            ) : null}
            {bulkKind === "target_date" || bulkKind === "date_cadence" ? (
              <input type="date" className={selectClass} value={bulkDate} onChange={(event) => setBulkDate(event.target.value)} aria-label={bulkKind === "date_cadence" ? "First publication date" : "Target publication date"} />
            ) : null}
            {bulkKind === "date_cadence" ? (
              <label className="flex items-center gap-1 text-xs">every <input type="number" min={1} max={365} className={cn(selectClass, "w-16")} value={cadenceDays} onChange={(event) => setCadenceDays(event.target.value)} /> days</label>
            ) : null}
            {bulkKind === "video" ? (
              <select className={selectClass} value={bulkVideo} onChange={(event) => setBulkVideo(event.target.value)}>
                <option value="inherit">Use project default</option>
                <option value="required">Require video</option>
                <option value="skip">Skip video</option>
              </select>
            ) : null}
            <Button
              size="sm"
              className="ml-auto"
              disabled={
                pending ||
                (bulkKind === "production_status" &&
                  productionSelectionCount === 0)
              }
              onClick={() => setConfirmOpen(true)}
            >
              {pending ? <Loader2 className="animate-spin" /> : <Check />} Review update
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm bulk update</DialogTitle>
            <DialogDescription>
              This will update {bulkKind === "production_status" ? productionSelectionCount : selected.size} {unitSingular}{(bulkKind === "production_status" ? productionSelectionCount : selected.size) === 1 ? "" : "s"}
              {bulkKind === "stage_assignee"
                ? ` and up to ${selected.size} production tasks`
                : bulkKind === "production_status"
                  ? ` and replace up to ${productionSelectionCount * data.workflowStages.length} underlying production-task statuses`
                : bulkKind === "assign_defaults"
                  ? ` and up to ${selected.size * data.workflowStages.length} unassigned production tasks`
                  : bulkKind === "target_date" || bulkKind === "date_cadence"
                    ? ` and recalculate unfinished production deadlines`
                    : ""}.
              {bulkKind === "production_status"
                ? " This keeps the production label consistent with Tasks. Moving backward resets later stage work."
                : ""} Successful updates are kept if another episode fails.
              {bulkKind === "production_status" && protectedProductionSelectionCount > 0
                ? ` ${protectedProductionSelectionCount} scheduled or published episode${protectedProductionSelectionCount === 1 ? " is" : "s are"} protected and will be reported as skipped.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button onClick={applyBulkOperation}>Confirm update</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <WorkflowSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        projectId={projectId}
        projectVideoRequired={data.projectVideoRequired}
        defaults={data.stageDefaults}
        users={data.assignableUsers}
        pending={pending}
        run={run}
        projectKind={data.projectKind}
        profile={data.workflowProfile}
        stages={data.workflowStages}
      />
    </div>
  );
}

type RowSharedProps = {
  episode: EpisodeProductionRow;
  index: number;
  expanded: boolean;
  selected: boolean;
  canEdit: boolean;
  currentUserId: string;
  users: { id: string; name: string }[];
  projectSlug: string;
  pending: boolean;
  workflow: Pick<
    EpisodeData,
    | "projectKind"
    | "workflowProfile"
    | "workflowStages"
    | "editorialLabel"
    | "projectVideoRequired"
  >;
  onToggleExpand: () => void;
  onSelect: (checked: boolean, shift: boolean) => void;
  run: (
    action: () => Promise<{ error?: string }>,
    successMessage?: string,
    mutation?: EpisodeMutation
  ) => void;
};

type EpisodeMutation = {
  episodeId: string;
  episode?: Partial<EpisodeProductionRow>;
  taskId?: string;
  task?: Partial<EpisodeProductionRow["tasks"][number]>;
};

function applyEpisodeMutation(data: EpisodeData, mutation: EpisodeMutation): EpisodeData {
  const episodes = data.episodes.map((episode) => {
    const changed =
      episode.id !== mutation.episodeId
        ? episode
        : {
            ...episode,
            ...mutation.episode,
            tasks: mutation.taskId
              ? episode.tasks.map((task) =>
                  task.id === mutation.taskId ? { ...task, ...mutation.task } : task
                )
              : episode.tasks,
          };
    return changed.id === mutation.episodeId
      ? deriveEpisodeRow(changed, data)
      : changed;
  });
  const publishedCount = episodes.filter(
    (episode) => episode.publishingStatus === "published"
  ).length;
  const scheduledCount = episodes.filter(
    (episode) => episode.publishingStatus === "scheduled"
  ).length;
  return {
    ...data,
    episodes,
    publishedCount,
    scheduledCount,
    draftCount: episodes.length - publishedCount - scheduledCount,
    setupNeededCount: episodes.filter((episode) => !episode.workflowComplete).length,
    notStartedCount: episodes.filter(
      (episode) => episode.productionStatus === "Not started"
    ).length,
    inProductionCount: episodes.filter(
      (episode) =>
        ![
          "Setup incomplete",
          "Not started",
          "Ready to schedule",
          "Scheduled",
          "Published",
        ].includes(episode.productionStatus)
    ).length,
    translatingCount: episodes.filter((episode) =>
      ["Translating", "Reviewing translation"].includes(
        episode.productionStatus
      )
    ).length,
    readyCount: episodes.filter(
      (episode) => episode.productionStatus === "Ready to schedule"
    ).length,
    overdueCount: episodes.filter((episode) => episode.overdueCount > 0).length,
    unassignedCount: episodes.filter((episode) => episode.unassignedCount > 0)
      .length,
    milestones: data.milestones.map((milestone) => ({
      ...milestone,
      reached: publishedCount >= milestone.n,
    })),
  };
}

function deriveEpisodeRow(
  episode: EpisodeProductionRow,
  data: Pick<
    EpisodeData,
    "projectVideoRequired" | "projectKind" | "videoProductionMode" | "workflowProfile"
  >
): EpisodeProductionRow {
  const videoRequired = episode.videoRequiredOverride ?? data.projectVideoRequired;
  const profile = {
    ...data.workflowProfile,
    videoRequired,
  };
  const statuses = Object.fromEntries(
    episode.tasks.map((task) => [task.stage, task.status])
  ) as Partial<Record<PodcastStage, PodcastTaskStatus>>;
  const presentStages = new Set(episode.tasks.map((task) => task.stage));
  const missingStageCount = requiredStages(profile).filter(
    (stage) => !presentStages.has(stage)
  ).length;
  const workflowComplete = missingStageCount === 0;
  const relevantTasks = episode.tasks.filter(
    (task) => videoRequired || !VIDEO_STAGES.includes(task.stage)
  );
  const today = new Date().toISOString().slice(0, 10);

  return {
    ...episode,
    videoRequired,
    productionStatus: deriveEpisodeProductionStatus({
      publishingStatus: episode.publishingStatus,
      videoRequired,
      workflowProfile: profile,
      statuses,
      workflowComplete,
    }),
    translationProgress: trackProgress(
      statuses,
      data.projectKind === "video_series" && data.videoProductionMode === "original"
        ? ORIGINAL_VIDEO_EDITORIAL_STAGES
        : TRANSLATION_STAGES
    ),
    audioProgress:
      data.projectKind === "podcast" ? trackProgress(statuses, AUDIO_STAGES) : null,
    videoProgress: videoRequired ? trackProgress(statuses, VIDEO_STAGES) : null,
    overdueCount: relevantTasks.filter(
      (task) =>
        task.status !== "done" && task.dueDate != null && task.dueDate < today
    ).length,
    blockedCount: relevantTasks.filter(
      (task) => task.status !== "done" && task.blocked
    ).length,
    unassignedCount:
      (episode.ownerId ? 0 : 1) +
      missingStageCount +
      relevantTasks.filter(
        (task) => task.status !== "done" && !task.assignedTo
      ).length,
    workflowComplete,
    missingStageCount,
  };
}

function EpisodeTableRows(props: RowSharedProps) {
  const { episode } = props;
  return (
    <>
      <tr className={cn("border-b transition-colors hover:bg-muted/25", props.selected && "bg-primary/5")}>
        <td className="px-3 py-3 align-middle">
          <input type="checkbox" checked={props.selected} onClick={(event) => props.onSelect(event.currentTarget.checked, event.shiftKey)} onChange={() => {}} className="size-4 accent-primary" aria-label={`Select episode ${episode.name}`} />
        </td>
        <td className="max-w-64 px-2 py-3 align-middle">
          <button className="group flex min-w-0 items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={props.onToggleExpand} aria-expanded={props.expanded}>
            {props.expanded ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
            <span className="w-7 shrink-0 text-xs tabular-nums text-muted-foreground">{episode.orderIndex + 1}</span>
            <span className="min-w-0 truncate font-medium group-hover:underline">{episode.name}</span>
          </button>
        </td>
        <td className="px-2 py-3"><ProductionBadge status={episode.productionStatus} /></td>
        <td className="px-2 py-3"><OwnerControl episode={episode} canEdit={props.canEdit} users={props.users} pending={props.pending} run={props.run} /></td>
        <td className="px-2 py-3"><ProgressCell label={props.workflow.editorialLabel} progress={episode.translationProgress} setupIncomplete={!episode.workflowComplete} /></td>
        {props.workflow.projectKind === "podcast" ? <td className="px-2 py-3"><ProgressCell label="Audio" progress={episode.audioProgress} setupIncomplete={!episode.workflowComplete} /></td> : null}
        <td className="px-2 py-3"><ProgressCell label="Video" progress={episode.videoProgress} setupIncomplete={!episode.workflowComplete} /></td>
        <td className="px-2 py-3"><TargetDateControl episode={episode} canEdit={props.canEdit} pending={props.pending} run={props.run} /></td>
        <td className="px-3 py-3"><Readiness episode={episode} /></td>
      </tr>
      {props.expanded ? (
        <tr className="border-b bg-muted/20">
          <td colSpan={props.workflow.projectKind === "podcast" ? 9 : 8} className="p-0">
            <StageChecklist {...props} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function EpisodeMobileCard(props: RowSharedProps) {
  const { episode } = props;
  const nextTask = episode.tasks.find((task) => task.status !== "done" && !task.blocked);
  return (
    <article className={cn("p-4", props.selected && "bg-primary/5")}>
      <div className="flex items-start gap-3">
        <input type="checkbox" checked={props.selected} onClick={(event) => props.onSelect(event.currentTarget.checked, event.shiftKey)} onChange={() => {}} className="mt-1 size-4 accent-primary" aria-label={`Select episode ${episode.name}`} />
        <button className="min-w-0 flex-1 text-left" onClick={props.onToggleExpand} aria-expanded={props.expanded}>
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{props.workflow.projectKind === "video_series" ? "Video" : "Episode"} {episode.orderIndex + 1}</p>
              <h3 className="truncate font-medium">{episode.name}</h3>
            </div>
            {props.expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4 text-muted-foreground" />}
          </div>
          <ProductionBadge status={episode.productionStatus} />
          <div className="mt-3 flex items-center justify-between gap-3 text-xs">
            <span className="truncate text-muted-foreground">
              {!episode.workflowComplete
                ? "Workflow setup needed"
                : nextTask
                  ? `Next: ${PODCAST_STAGE_META[nextTask.stage].shortLabel}`
                  : "Production complete"}
            </span>
            <Readiness episode={episode} />
          </div>
        </button>
      </div>
      {props.expanded ? <StageChecklist {...props} mobile /> : null}
    </article>
  );
}

function OwnerControl({ episode, canEdit, users, pending, run }: Pick<RowSharedProps, "episode" | "canEdit" | "users" | "pending" | "run">) {
  if (!canEdit) return <span className="text-xs text-muted-foreground">{episode.ownerName ?? "Unassigned"}</span>;
  return (
    <PersonSelect
      value={episode.ownerId ?? ""}
      users={users}
      emptyLabel="Unassigned"
      disabled={pending}
      onChange={(value) =>
        run(
          () => setEpisodeOwner(episode.id, value || null),
          undefined,
          { episodeId: episode.id, episode: { ownerId: value || null } }
        )
      }
      ariaLabel={`Owner for ${episode.name}`}
    />
  );
}

function TargetDateControl({ episode, canEdit, pending, run }: Pick<RowSharedProps, "episode" | "canEdit" | "pending" | "run">) {
  if (!canEdit) return <span className="text-xs tabular-nums text-muted-foreground">{episode.scheduledDate ?? "No date"}</span>;
  return <input type="date" className={cn(selectClass, "w-32")} value={episode.scheduledDate ?? ""} disabled={pending} aria-label={`Target publication date for ${episode.name}`} onChange={(event) => { const value = event.target.value || null; run(() => setEpisodeSchedule(episode.id, value), undefined, { episodeId: episode.id, episode: { scheduledDate: value } }); }} />;
}

function StageChecklist(props: RowSharedProps & { mobile?: boolean }) {
  const { episode } = props;
  const tasksByStage = new Map(episode.tasks.map((task) => [task.stage, task]));
  return (
    <div className={cn("px-4 py-4 md:px-12", props.mobile && "-mx-4 mt-4 border-t px-4 pb-0")}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold tracking-wide uppercase">Production checklist</p>
          <p className="text-xs text-muted-foreground">
            {props.workflow.projectKind === "video_series"
              ? "Editorial approval comes before video production, review, and publishing."
              : "Video begins only after the audio master is complete."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {props.workflow.projectKind === "podcast" && props.canEdit ? (
            <select className={selectClass} value={episode.publishingStatus} disabled={props.pending} onChange={(event) => { const value = event.target.value as "draft" | "scheduled" | "published"; props.run(() => setEpisodeStatus(episode.id, value), undefined, { episodeId: episode.id, episode: { publishingStatus: value } }); }} aria-label={`Publishing status for ${episode.name}`}>
              <option value="draft">Draft</option>
              <option value="scheduled">Scheduled</option>
              <option value="published">Published</option>
            </select>
          ) : null}
          {props.canEdit ? (
            <select className={selectClass} value={episode.videoRequiredOverride == null ? "inherit" : episode.videoRequiredOverride ? "required" : "skip"} disabled={props.pending} onChange={(event) => { const value = event.target.value === "inherit" ? null : event.target.value === "required"; props.run(() => setEpisodeVideoRequirement(episode.id, value), undefined, { episodeId: episode.id, episode: { videoRequiredOverride: value, videoRequired: value ?? episode.videoRequired } }); }} aria-label={`Video requirement for ${episode.name}`}>
              <option value="inherit">Video: project default</option>
              <option value="required">Video: required</option>
              <option value="skip">Video: skip</option>
            </select>
          ) : props.workflow.projectKind === "podcast" ? (
            <Badge variant="outline"><Video /> {episode.videoRequired ? "Video required" : "Video not required"}</Badge>
          ) : null}
          {episode.externalUrl ? <a href={episode.externalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">Published {props.workflow.projectKind === "video_series" ? "video" : "episode"} <ExternalLink className="size-3" /></a> : null}
        </div>
      </div>
      <div className="grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
        {props.workflow.workflowStages.map((stage) => {
          if (!episode.videoRequired && (stage === "produce_video" || stage === "approve_video")) {
            return (
              <div key={stage} className="rounded-lg border border-dashed p-3 opacity-60">
                <p className="text-sm font-medium">{PODCAST_STAGE_META[stage].label}</p>
                <p className="mt-1 text-xs text-muted-foreground">Not required for this episode</p>
              </div>
            );
          }
          const task = tasksByStage.get(stage);
          return task ? (
            <StageTaskCard key={stage} task={task} {...props} />
          ) : (
            <div key={stage} className="rounded-lg border border-dashed p-3">
              <p className="text-sm font-medium">{PODCAST_STAGE_META[stage].label}</p>
              <p className="mt-1 text-xs font-medium text-destructive">Missing task — repair production tracking.</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StageTaskCard({ task, ...props }: RowSharedProps & { task: EpisodeStageTask; mobile?: boolean }) {
  const mayUpdateStatus = props.canEdit || task.assignedTo === props.currentUserId;
  return (
    <div className={cn("rounded-lg border bg-background p-3", task.blocked && task.status !== "done" && "border-dashed bg-muted/30")}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{PODCAST_STAGE_META[task.stage].label}</p>
          <p className="text-[11px] text-muted-foreground">{task.blocked && task.status !== "done" ? "Waiting for the previous step" : task.status === "done" ? "Step complete" : "Ready for work"}</p>
        </div>
        {task.status === "done" ? <span className="grid size-6 shrink-0 place-items-center rounded-full bg-success/10 text-success"><Check className="size-3.5" /></span> : <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"><CircleDashed className="size-3.5" /></span>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select className={selectClass} value={task.status} disabled={!mayUpdateStatus || props.pending} onChange={(event) => { const value = event.target.value as PodcastTaskStatus; props.run(() => setEpisodeStageStatus(task.id, value), undefined, { episodeId: props.episode.id, taskId: task.id, task: { status: value } }); }} aria-label={`Status for ${PODCAST_STAGE_META[task.stage].label}`}>
          {Object.entries(taskStatusLabels).map(([value, label]) => (
            <option
              key={value}
              value={value}
              disabled={task.blocked && value !== "todo"}
            >
              {label}
            </option>
          ))}
        </select>
        {props.canEdit ? (
          <PersonSelect value={task.assignedTo ?? ""} users={props.users} emptyLabel="Unassigned" disabled={props.pending} onChange={(value) => props.run(() => setEpisodeStageAssignee(props.episode.id, task.stage, value || null), undefined, { episodeId: props.episode.id, taskId: task.id, task: { assignedTo: value || null, assigneeName: props.users.find((user) => user.id === value)?.name ?? null } })} ariaLabel={`Assignee for ${PODCAST_STAGE_META[task.stage].label}`} />
        ) : <span className="truncate text-xs text-muted-foreground">{task.assigneeName ?? "Unassigned"}</span>}
        {props.canEdit ? (
          <input type="date" className={selectClass} value={task.dueDate ?? ""} disabled={props.pending} onChange={(event) => { const value = event.target.value || null; props.run(() => setEpisodeStageDueDate(task.id, value), undefined, { episodeId: props.episode.id, taskId: task.id, task: { dueDate: value } }); }} aria-label={`Due date for ${PODCAST_STAGE_META[task.stage].label}`} />
        ) : <span className="text-xs tabular-nums text-muted-foreground">{task.dueDate ?? "No due date"}</span>}
        <Link href={`/projects/${props.projectSlug}/tasks`} className="inline-flex h-8 items-center justify-end gap-1 text-xs text-primary hover:underline">Open in Tasks <ChevronRight className="size-3" /></Link>
      </div>
    </div>
  );
}

function PersonSelect({ value, onChange, users, emptyLabel, disabled, ariaLabel }: { value: string; onChange: (value: string) => void; users: { id: string; name: string }[]; emptyLabel: string; disabled?: boolean; ariaLabel?: string }) {
  return (
    <select className={cn(selectClass, "max-w-36")} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} aria-label={ariaLabel}>
      <option value="">{emptyLabel}</option>
      {users.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
    </select>
  );
}

function StageSelect({ value, onChange, stages }: { value: PodcastStage; onChange: (value: PodcastStage) => void; stages: PodcastStage[] }) {
  return (
    <select className={selectClass} value={value} onChange={(event) => onChange(event.target.value as PodcastStage)} aria-label="Production step">
      {stages.map((stage) => <option key={stage} value={stage}>{PODCAST_STAGE_META[stage].label}</option>)}
    </select>
  );
}

function WorkflowSettingsDialog({ open, onOpenChange, projectId, projectVideoRequired, projectKind, profile, stages, defaults, users, pending, run }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectVideoRequired: boolean;
  projectKind: "podcast" | "video_series";
  profile: EpisodeData["workflowProfile"];
  stages: PodcastStage[];
  defaults: EpisodeData["stageDefaults"];
  users: { id: string; name: string }[];
  pending: boolean;
  run: (action: () => Promise<{ error?: string }>, successMessage?: string) => void;
}) {
  const [videoRequired, setVideoRequired] = useState(projectVideoRequired);
  const [settings, setSettings] = useState(() =>
    stages.map((stage) => ({ stage, ...defaults[stage] }))
  );
  const offsetsFollowSequence = stageOffsetsFollowSequence(
    Object.fromEntries(
      settings.map((setting) => [setting.stage, setting.daysBeforePublication])
    ),
    profile
  );

  function updateStage(stage: PodcastStage, patch: Partial<(typeof settings)[number]>) {
    setSettings((current) => current.map((setting) => setting.stage === stage ? { ...setting, ...patch } : setting));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{projectKind === "video_series" ? "Video" : "Podcast"} workflow defaults</DialogTitle>
          <DialogDescription>New and unassigned production steps use these people and backward-planned offsets. Manual task dates stay unchanged.</DialogDescription>
        </DialogHeader>
        {projectKind === "podcast" ? <label className="flex items-center justify-between rounded-lg border p-3 text-sm">
          <span><span className="block font-medium">Video required by default</span><span className="text-xs text-muted-foreground">Episodes can override this individually.</span></span>
          <input type="checkbox" checked={videoRequired} onChange={(event) => setVideoRequired(event.target.checked)} className="size-4 accent-primary" />
        </label> : null}
        <div className="overflow-hidden rounded-lg border">
          <div className="grid grid-cols-[1.3fr_1fr_100px] gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
            <span>Work step</span><span>Default assignee</span><span>Days before</span>
          </div>
          <div className="divide-y">
            {settings.map((setting) => (
              <div key={setting.stage} className="grid grid-cols-[1.3fr_1fr_100px] items-center gap-2 px-3 py-2">
                <span className="text-sm">{PODCAST_STAGE_META[setting.stage].label}</span>
                <PersonSelect value={setting.assigneeId ?? ""} users={users} emptyLabel="Unassigned" onChange={(value) => updateStage(setting.stage, { assigneeId: value || null })} />
                <Input type="number" min={0} max={365} value={setting.daysBeforePublication} onChange={(event) => updateStage(setting.stage, { daysBeforePublication: Number.parseInt(event.target.value, 10) || 0 })} className="h-8" aria-label={`Days before publication for ${PODCAST_STAGE_META[setting.stage].label}`} />
              </div>
            ))}
          </div>
        </div>
        {!offsetsFollowSequence ? (
          <p className="text-xs font-medium text-destructive">
            Earlier work steps need an equal or larger “Days before” value than
            every step that follows.
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={pending || !offsetsFollowSequence} onClick={() => {
            run(
              () => updatePodcastWorkflowSettings(projectId, {
                videoRequired,
                stages: settings.map((setting) => ({
                  stage: setting.stage,
                  defaultAssigneeId: setting.assigneeId,
                  daysBeforePublication: setting.daysBeforePublication,
                })),
              }),
              `${projectKind === "video_series" ? "Video" : "Podcast"} workflow defaults saved.`
            );
            onOpenChange(false);
          }}>
            {pending ? <Loader2 className="animate-spin" /> : <Settings2 />} Save defaults
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
