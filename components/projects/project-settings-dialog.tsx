"use client";

import { confirmDialog } from "@/lib/dialog-requests";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronDown, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import {
  deleteProject,
  updateProjectKind,
  updateProjectLanguages,
  updateProjectPrintFunding,
  updateProjectStatus,
  updateProjectTitle,
  updateVideoProductionMode,
} from "@/lib/projects/actions";
import { updateProjectSchedule } from "@/lib/schedule/actions";
import { formatDate } from "@/lib/format";
import {
  PROJECT_KINDS,
  PROJECT_KIND_LABELS,
  type ProjectKind,
  type VideoProductionMode,
  VIDEO_PRODUCTION_MODE_LABELS,
  VIDEO_PRODUCTION_MODES,
} from "@/lib/projects/kinds";
import {
  PRINT_FUNDING_DESCRIPTIONS,
  PRINT_FUNDING_LABELS,
  PRINT_FUNDING_STATUSES,
  type PrintFundingStatus,
} from "@/lib/projects/print-funding";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePropState } from "@/hooks/use-prop-state";
import { useProjectTitle } from "@/components/projects/project-title-context";
import {
  beginProjectTitleSave,
  completeProjectTitleSave,
  createProjectTitleEditorState,
  editProjectTitle,
  failProjectTitleSave,
  syncProjectTitleSource,
} from "@/lib/projects/title-editor-state";
import {
  PROJECT_OPEN_STATUSES,
  PROJECT_STATUS_LABELS,
  isClosedProjectStatus,
  type ProjectOpenStatus,
} from "@/lib/projects/status";

const selectClass =
  "flex h-11 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:h-9";

const fieldClass = "h-11 sm:h-9";
const saveButtonClass = "h-11 w-full sm:h-9 sm:w-auto";

type ProjectSettingsDialogProps = {
  projectId: string;
  projectSlug: string;
  projectTitle: string;
  status: string;
  defaultOpen?: boolean;
  focusName?: boolean;
  kind: string | null;
  printFundingStatus: PrintFundingStatus;
  videoProductionMode: string | null;
  sourceLanguage: string | null;
  targetLanguage: string | null;
  targetLanguageTitle: string | null;
  startDate: string | null;
  estimatedDurationMonths: number | null;
  defaultDurationMonths: number;
  dueDate: string | null;
  completeByDate: string | null;
  taskCount: number;
  phaseCount: number;
  memberCount: number;
  fileCount: number;
};

function addMonthsYmd(ymd: string, months: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1 + months, d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export function ProjectSettingsDialog({
  projectId,
  projectSlug,
  projectTitle,
  status,
  defaultOpen = false,
  focusName = false,
  kind,
  printFundingStatus,
  videoProductionMode,
  sourceLanguage,
  targetLanguage,
  targetLanguageTitle,
  startDate,
  estimatedDurationMonths,
  defaultDurationMonths,
  dueDate,
  completeByDate,
  taskCount,
  phaseCount,
  memberCount,
  fileCount,
}: ProjectSettingsDialogProps) {
  const router = useRouter();
  const { title: visibleProjectTitle, setTitle: setVisibleProjectTitle } =
    useProjectTitle();
  const [open, setOpen] = useState(defaultOpen);
  const [titleState, setTitleState] = useState(() =>
    createProjectTitleEditorState(projectTitle)
  );
  const [titlePending, startTitle] = useTransition();
  const [typedTitle, setTypedTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [languagePending, startLanguage] = useTransition();
  const [kindVal, setKindVal] = useState<ProjectKind>((kind as ProjectKind) ?? "book");
  const [savedKind, setSavedKind] = usePropState<ProjectKind>(
    (kind as ProjectKind) ?? "book"
  );
  const [kindPending, startKind] = useTransition();
  const initialOpenStatus = isClosedProjectStatus(status)
    ? "planning"
    : (status as ProjectOpenStatus);
  const [statusVal, setStatusVal] =
    usePropState<ProjectOpenStatus>(initialOpenStatus);
  const [savedStatus, setSavedStatus] =
    usePropState<ProjectOpenStatus>(initialOpenStatus);
  const [statusPending, startStatus] = useTransition();
  const [fundingVal, setFundingVal] = usePropState<PrintFundingStatus>(printFundingStatus);
  const [savedFunding, setSavedFunding] = usePropState<PrintFundingStatus>(printFundingStatus);
  const [fundingPending, startFunding] = useTransition();
  const [mode, setMode] = useState<VideoProductionMode>(
    videoProductionMode === "translation" ? "translation" : "original"
  );
  const [savedMode, setSavedMode] = usePropState<VideoProductionMode>(
    videoProductionMode === "translation" ? "translation" : "original"
  );
  const [modePending, startMode] = useTransition();
  const [source, setSource] = useState(sourceLanguage ?? "");
  const [target, setTarget] = useState(targetLanguage ?? "");
  const [localizedTitle, setLocalizedTitle] = useState(targetLanguageTitle ?? "");
  const [schedStart, setSchedStart] = useState(startDate ?? "");
  const [schedDur, setSchedDur] = useState(
    estimatedDurationMonths != null ? String(estimatedDurationMonths) : ""
  );
  const [schedulePending, startSchedule] = useTransition();
  const syncedTitleState = syncProjectTitleSource(titleState, projectTitle);
  if (syncedTitleState !== titleState) setTitleState(syncedTitleState);
  const canSaveTitle =
    syncedTitleState.draft.trim().length > 0 &&
    syncedTitleState.draft.trim() !== syncedTitleState.saved;
  const canDelete = typedTitle === visibleProjectTitle;

  const effectiveDuration = schedDur ? Number(schedDur) : defaultDurationMonths;
  const plannedEnd = schedStart ? addMonthsYmd(schedStart, effectiveDuration) : null;
  const deadline = completeByDate ?? dueDate;
  const scheduleLate = !!(plannedEnd && deadline && plannedEnd > deadline);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canDelete) return;
    const formData = new FormData(event.currentTarget);
    setError(null);
    router.replace(`/projects?optimisticDeleted=${projectId}`);
    start(async () => {
      try {
        const result = await deleteProject({}, formData);
        if (result.error) throw new Error(result.error);
        router.replace("/projects");
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "Could not delete the project.";
        setError(message);
        router.replace("/projects");
        toast.error(message);
      }
    });
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen && defaultOpen) {
      router.replace(`/projects/${projectSlug}`);
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="gap-0 overflow-hidden p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
      >
        <SheetHeader className="relative shrink-0 border-b px-4 py-4 pr-14 sm:px-5">
          <SheetTitle className="font-heading text-lg">Project settings</SheetTitle>
          <SheetDescription>
            Project-wide setup, scheduling, and administrative actions.
          </SheetDescription>
          <SheetClose
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                className="absolute right-2 top-2"
                aria-label="Close project settings"
              />
            }
          >
            <X className="size-4" />
          </SheetClose>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 sm:px-5">
          <section id="project-name" className="grid gap-4 border-b py-5">
            <div>
              <h3 className="text-sm font-semibold">Project name</h3>
              <p className="text-sm text-muted-foreground">
                This name appears in the project header, portfolio, tasks, and
                project pickers. The project link stays the same.
              </p>
            </div>
            <form
              className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
              onSubmit={(event) => {
                event.preventDefault();
                if (!canSaveTitle || titlePending) return;

                const optimistic = beginProjectTitleSave(syncedTitleState);
                setTitleState(optimistic);
                setVisibleProjectTitle(optimistic.saved);
                startTitle(async () => {
                  const rollback = (message: string) => {
                    const failed = failProjectTitleSave(optimistic, message);
                    setTitleState(failed);
                    setVisibleProjectTitle(failed.saved);
                    toast.error(message);
                  };

                  try {
                    const result = await updateProjectTitle(
                      projectId,
                      optimistic.saved
                    );
                    if (result.error || !result.title) {
                      rollback(result.error ?? "Could not rename the project.");
                      return;
                    }

                    const completed = completeProjectTitleSave(
                      optimistic,
                      result.title
                    );
                    setTitleState(completed);
                    setVisibleProjectTitle(completed.saved);
                    toast.success("Project name saved");
                    router.refresh();
                  } catch (caught) {
                    const message =
                      caught instanceof Error
                        ? caught.message
                        : "Could not rename the project.";
                    rollback(message);
                  }
                });
              }}
            >
              <div className="grid min-w-0 gap-2">
                <Label htmlFor="project-title">Name</Label>
                <Input
                  id="project-title"
                  className={fieldClass}
                  value={syncedTitleState.draft}
                  onChange={(event) =>
                    setTitleState(
                      editProjectTitle(syncedTitleState, event.target.value)
                    )
                  }
                  maxLength={200}
                  autoFocus={focusName}
                  disabled={titlePending}
                  aria-invalid={syncedTitleState.error ? true : undefined}
                  aria-describedby={
                    syncedTitleState.error ? "project-title-error" : undefined
                  }
                />
                {syncedTitleState.error ? (
                  <p
                    id="project-title-error"
                    role="alert"
                    className="text-xs text-destructive"
                  >
                    {syncedTitleState.error} Your new name is still in the field
                    so you can try again.
                  </p>
                ) : null}
              </div>
              <Button
                type="submit"
                variant="outline"
                className={saveButtonClass}
                disabled={!canSaveTitle || titlePending}
              >
                {titlePending ? <Loader2 className="size-4 animate-spin" /> : null}
                {titlePending ? "Saving name…" : "Save name"}
              </Button>
            </form>
          </section>
          {!isClosedProjectStatus(status) ? (
          <section className="grid gap-4 border-b py-5">
            <div>
              <h3 className="text-sm font-semibold">Lifecycle stage</h3>
              <p className="text-sm text-muted-foreground">
                Proposal work stays outside delivery capacity and overdue counts
                until it moves to Planning or Active.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div className="grid min-w-0 gap-2">
                <Label htmlFor="project-status">Status</Label>
                <select
                  id="project-status"
                  className={selectClass}
                  value={statusVal}
                  onChange={(event) =>
                    setStatusVal(event.target.value as ProjectOpenStatus)
                  }
                >
                  {PROJECT_OPEN_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {PROJECT_STATUS_LABELS[value]}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                type="button"
                variant="outline"
                className={saveButtonClass}
                disabled={statusPending || statusVal === savedStatus}
                onClick={() => {
                  const previous = savedStatus;
                  const next = statusVal;
                  setSavedStatus(next);
                  startStatus(async () => {
                    const result = await updateProjectStatus(projectId, next);
                    if (result.error) {
                      setSavedStatus(previous);
                      setStatusVal(previous);
                      toast.error(result.error);
                      return;
                    }
                    toast.success(`Project moved to ${PROJECT_STATUS_LABELS[next]}`);
                    router.refresh();
                  });
                }}
              >
                {statusPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Save status
              </Button>
            </div>
          </section>
        ) : null}

          <section className="grid gap-4 border-b py-5">
          <div>
            <h3 className="text-sm font-semibold">Project type</h3>
            <p className="text-sm text-muted-foreground">
              Sets which work path this project schedules on (Books vs. Creative
              media) and its default duration. Untyped projects are treated as
              books.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="project-kind">Type</Label>
              <select
                id="project-kind"
                className={selectClass}
                value={kindVal}
                onChange={(e) => setKindVal(e.target.value as ProjectKind)}
              >
                {PROJECT_KINDS.map((value) => (
                  <option key={value} value={value}>
                    {PROJECT_KIND_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              variant="outline"
              className={saveButtonClass}
              disabled={kindPending || kindVal === savedKind}
              onClick={() =>
                startKind(async () => {
                  const res = await updateProjectKind(projectId, kindVal);
                  if (res.error) {
                    toast.error(res.error);
                  } else {
                    setSavedKind(kindVal);
                    toast.success("Project type saved");
                    router.refresh();
                  }
                })
              }
            >
              {kindPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Save type
            </Button>
          </div>
          {savedKind === "video_series" ? (
            <div className="grid gap-4 border-t pt-4">
              <div>
                <Label htmlFor="video-production-mode">Video production mode</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  This applies to every video in the project and changes its standard tasks.
                  Existing tasks with human activity are preserved.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <select
                  id="video-production-mode"
                  className={`${selectClass} min-w-48 flex-1`}
                  value={mode}
                  onChange={(event) =>
                    setMode(event.target.value as VideoProductionMode)
                  }
                >
                  {VIDEO_PRODUCTION_MODES.map((value) => (
                    <option key={value} value={value}>
                      {VIDEO_PRODUCTION_MODE_LABELS[value]}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  className={saveButtonClass}
                  disabled={modePending || mode === savedMode}
                  onClick={async () => {
                    const confirmed = (await confirmDialog(`Change every video to the ${VIDEO_PRODUCTION_MODE_LABELS[mode]} workflow? Untouched obsolete generated tasks will be removed; tasks with assignments, progress, comments, time, or files will be preserved as ordinary tasks.`));
                    if (!confirmed) return;
                    startMode(async () => {
                      const result = await updateVideoProductionMode(projectId, mode);
                      if (result.error) {
                        toast.error(result.error);
                        return;
                      }
                      setSavedMode(mode);
                      toast.success(
                        `Video workflow updated · ${result.created ?? 0} tasks added, ${result.removed ?? 0} removed${result.preserved ? `, ${result.preserved} preserved` : ""}`
                      );
                      router.refresh();
                    });
                  }}
                >
                  {modePending ? <Loader2 className="size-4 animate-spin" /> : null}
                  {modePending ? "Updating workflow…" : "Update workflow"}
                </Button>
              </div>
            </div>
          ) : null}
        </section>

        {savedKind === "book" ? (
          <section className="grid gap-4 border-b py-5">
            <div>
              <h3 className="text-sm font-semibold">Print plan and funding</h3>
              <p className="text-sm text-muted-foreground">
                While the status is <strong>Print decision not set</strong>,
                Sastra calculates the header badge from the Print / Ship line
                and the full project budget. Choose another status only to
                record a deliberate plan or override.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div className="grid min-w-0 gap-2">
                <Label htmlFor="print-funding-status">Current print status</Label>
                <select
                  id="print-funding-status"
                  className={selectClass}
                  value={fundingVal}
                  onChange={(event) =>
                    setFundingVal(event.target.value as PrintFundingStatus)
                  }
                >
                  {PRINT_FUNDING_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {PRINT_FUNDING_LABELS[status]}
                    </option>
                  ))}
                </select>
                <p className="text-xs leading-5 text-muted-foreground text-pretty">
                  {PRINT_FUNDING_DESCRIPTIONS[fundingVal]}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className={saveButtonClass}
                disabled={fundingPending || fundingVal === savedFunding}
                onClick={() => {
                  const previous = savedFunding;
                  const next = fundingVal;
                  setSavedFunding(next);
                  startFunding(async () => {
                    const result = await updateProjectPrintFunding(projectId, next);
                    if (result.error) {
                      setSavedFunding(previous);
                      setFundingVal(previous);
                      toast.error(result.error);
                      return;
                    }
                    toast.success("Print plan and funding saved");
                    router.refresh();
                  });
                }}
              >
                {fundingPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Save print status
              </Button>
            </div>
          </section>
        ) : null}

        <section className="grid gap-4 border-b py-5">
          <div>
            <h3 className="text-sm font-semibold">Schedule</h3>
            <p className="text-sm text-muted-foreground">
              When the project actually runs. Its planned finish (start +
              duration) feeds the capacity model and the Schedule roadmap.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="sched-start">Start date</Label>
              <Input className={fieldClass} id="sched-start" type="date" value={schedStart} onChange={(e) => setSchedStart(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sched-dur">Estimated duration (months)</Label>
              <Input className={fieldClass} id="sched-dur" type="number" min={1} max={120} value={schedDur} placeholder={`${defaultDurationMonths} (default)`} onChange={(e) => setSchedDur(e.target.value)} />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {plannedEnd ? (
              <>
                Planned finish{" "}
                <span className={scheduleLate ? "font-medium text-destructive" : "font-medium text-foreground"}>
                  {formatDate(plannedEnd)}
                </span>
                {deadline ? <> · deadline {formatDate(deadline)}</> : null}
                {scheduleLate ? " — finishes after the deadline" : null}
              </>
            ) : (
              "Add a start date to schedule this project."
            )}
          </p>
          <Button
            type="button"
            variant="outline"
            className={`${saveButtonClass} justify-self-stretch sm:justify-self-end`}
            disabled={schedulePending}
            onClick={() =>
              startSchedule(async () => {
                const res = await updateProjectSchedule(projectId, {
                  startDate: schedStart || null,
                  estimatedDurationMonths: schedDur ? Math.max(1, Math.min(120, Number(schedDur))) : null,
                });
                if (res.ok) {
                  toast.success("Schedule saved");
                  router.refresh();
                } else {
                  toast.error(res.error.message);
                }
              })
            }
          >
            {schedulePending ? <Loader2 className="size-4 animate-spin" /> : null}
            Save schedule
          </Button>
        </section>

        <section className="grid gap-4 border-b py-5">
          <div>
            <h3 className="text-sm font-semibold">Language override</h3>
            <p className="text-sm text-muted-foreground">Leave a language blank only when this project should not use the workspace pair.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2"><Label>Source language</Label><Input className={fieldClass} value={source} onChange={(event) => setSource(event.target.value)} /></div>
            <div className="grid gap-2"><Label>Target language</Label><Input className={fieldClass} value={target} onChange={(event) => setTarget(event.target.value)} /></div>
            <div className="grid gap-2 sm:col-span-2"><Label>Target-language title</Label><Input className={fieldClass} value={localizedTitle} onChange={(event) => setLocalizedTitle(event.target.value)} /></div>
          </div>
          <Button
            type="button"
            variant="outline"
            className={`${saveButtonClass} justify-self-stretch sm:justify-self-end`}
            disabled={languagePending}
            onClick={() => startLanguage(async () => {
              const result = await updateProjectLanguages(projectId, { sourceLanguage: source, targetLanguage: target, targetLanguageTitle: localizedTitle });
              if (result.error) toast.error(result.error); else { toast.success("Project languages saved"); router.refresh(); }
            })}
          >
            {languagePending ? <Loader2 className="size-4 animate-spin" /> : null}
            Save language override
          </Button>
        </section>

          <section className="py-5">
            <details className="group rounded-xl border border-destructive/30 bg-destructive/5">
              <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset [&::-webkit-details-marker]:hidden">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                  <AlertTriangle className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-destructive">
                    Danger zone
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Permanently delete this project and all related work.
                  </span>
                </span>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-open:rotate-180" />
              </summary>

              <form
                onSubmit={submit}
                className="grid gap-4 border-t border-destructive/20 px-4 py-4"
              >
                <input type="hidden" name="id" value={projectId} />

                <p className="text-sm text-destructive/90">
                  Deleting includes {taskCount} task
                  {taskCount === 1 ? "" : "s"}, {phaseCount} phase
                  {phaseCount === 1 ? "" : "s"}, {memberCount} member
                  assignment{memberCount === 1 ? "" : "s"}, {fileCount} project
                  file{fileCount === 1 ? "" : "s"}, blockers, budget, rights,
                  chat, and activity. This cannot be undone.
                </p>

                <div className="grid gap-2">
                  <Label htmlFor="delete-project-title">
                    Type the project title to confirm
                  </Label>
                  <Input
                    id="delete-project-title"
                    name="confirmTitle"
                    className={fieldClass}
                    value={typedTitle}
                    onChange={(event) => setTypedTitle(event.target.value)}
                    autoComplete="off"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Required title:{" "}
                    <span className="font-medium">{visibleProjectTitle}</span>
                  </p>
                </div>

                {error ? (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                ) : null}

                <Button
                  type="submit"
                  variant="destructive"
                  disabled={!canDelete || pending}
                  className="h-11 justify-self-stretch sm:justify-self-end"
                >
                  {pending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    "Delete project"
                  )}
                </Button>
              </form>
            </details>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
