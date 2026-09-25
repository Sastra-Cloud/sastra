"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { createTask } from "@/lib/tasks/actions";
import { createRecurringTask } from "@/lib/tasks/recurring-actions";
import {
  TaskDriveFilesPicker,
  TaskDriveFolderPicker,
} from "@/components/tasks/drive-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { TaskRow } from "@/lib/tasks/queries";
import type { TaskFormState } from "@/lib/tasks/actions";
import type { TaskDriveFileSelection } from "@/lib/tasks/drive-file-selection";

type Option = { id: string; name: string };
type Repeat = "none" | "weekly" | "monthly" | "quarterly" | "annual";
type OptimisticTaskCreateRequest = {
  task: TaskRow;
  save: () => Promise<TaskFormState>;
  onSuccess: (result: TaskFormState) => void;
  onError: (message: string) => void;
};

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const REPEAT_LABEL: Record<Exclude<Repeat, "none">, string> = {
  weekly: "week",
  monthly: "month",
  quarterly: "quarter",
  annual: "year",
};

export function CreateTaskDialog({
  projectId,
  printRunId = null,
  projectDriveFolderId = null,
  projects = [],
  phases = [],
  assignees,
  defaultStatus = "todo",
  defaultAssignee = "",
  defaultTitle = "",
  defaultDescription = "",
  defaultPriority = "medium",
  triggerLabel = "Add task",
  onOptimisticCreate,
}: {
  projectId?: string;
  printRunId?: string | null;
  /** The project's main Drive folder — the picker opens inside it. */
  projectDriveFolderId?: string | null;
  /** When set (and no fixed projectId), shows a project picker (default: general). */
  projects?: Option[];
  phases?: Option[];
  assignees: Option[];
  defaultStatus?: string;
  defaultAssignee?: string;
  defaultTitle?: string;
  defaultDescription?: string;
  defaultPriority?: "low" | "medium" | "high" | "urgent";
  triggerLabel?: string;
  /** Lets an owning task surface show a temporary task while the save settles. */
  onOptimisticCreate?: (request: OptimisticTaskCreateRequest) => void;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [repeat, setRepeat] = useState<Repeat>("none");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [optimisticPending, setOptimisticPending] = useState(false);
  const [driveFolder, setDriveFolder] = useState<{
    folderId: string;
    name: string;
    url: string;
  } | null>(null);
  const [driveFiles, setDriveFiles] = useState<TaskDriveFileSelection[]>([]);
  const recurring = repeat !== "none";

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("driveFiles", JSON.stringify(driveFiles));
    // Fixed projectId wins; otherwise use the picker (empty = general task).
    const selectedProjectId =
      projectId ?? (String(fd.get("projectId") ?? "") || null);
    const title = String(fd.get("title") ?? "").trim();
    if (!title) {
      setError("Title is required");
      return;
    }
    const anchorDate = String(fd.get("dueDate") ?? "");
    if (recurring && !anchorDate) {
      setError("Pick a start date for the repeat");
      return;
    }

    if (!recurring && onOptimisticCreate) {
      const temporaryId = `optimistic-task-${crypto.randomUUID()}`;
      const assignedTo = String(fd.get("assignedTo") ?? "") || null;
      const phaseId = String(fd.get("phaseId") ?? "") || null;
      const estimateHours = String(fd.get("estimateHours") ?? "").trim();
      const task: TaskRow = {
        id: temporaryId,
        projectId: selectedProjectId,
        title,
        description: String(fd.get("description") ?? "").trim() || null,
        status: String(fd.get("status") ?? "todo"),
        priority: String(fd.get("priority") ?? "medium"),
        dueDate: anchorDate || null,
        isMilestone: fd.get("isMilestone") === "on",
        rank: 0,
        estimateHours: estimateHours || null,
        updatedAt: new Date(),
        assignedTo,
        assigneeName:
          assignees.find((item) => item.id === assignedTo)?.name ?? null,
        printRunId,
        printPaymentId: null,
        printRunTitle: null,
        printRunKind: null,
        printNumber: null,
        phaseId,
        phaseName: phases.find((item) => item.id === phaseId)?.name ?? null,
        unitId: null,
        unitName: null,
        driveFolderId: driveFolder?.folderId ?? null,
        driveFolderName: driveFolder?.name ?? null,
        driveFolderUrl: driveFolder?.url ?? null,
        driveFileCount: driveFiles.length,
        driveFileName: driveFiles[0]?.name ?? null,
        driveFileUrl: driveFiles[0]?.url ?? null,
        sourceRecurringTaskId: null,
        approvalAssignmentId: null,
        approvalRequestId: null,
        approvalDecision: null,
        approvalRequestStatus: null,
        approvalProjectSlug: null,
        sourceEmailSuggestionId: null,
        sourceEmailThreadId: null,
        sourceEmailUrl: null,
        sourceEmailUrlLabel: null,
        sourceEmailSubject: null,
        sourceEmailSender: null,
        sourceEmailMode: null,
      };

      setOptimisticPending(true);
      setOpen(false);
      try {
        onOptimisticCreate({
          task,
          save: () => createTask({}, fd),
          onSuccess: (result) => {
            setOptimisticPending(false);
            setRepeat("none");
            setDriveFolder(null);
            setDriveFiles([]);
            formRef.current?.reset();
            if (result.warning) toast.warning(result.warning);
            else toast.success("Task created");
          },
          onError: (message) => {
            setOptimisticPending(false);
            setError(message);
            setOpen(true);
          },
        });
      } catch {
        setOptimisticPending(false);
        setError("Couldn't create the task. Please check your internet and try again.");
        setOpen(true);
      }
      return;
    }

    start(async () => {
      try {
        let warning: string | undefined;
        if (recurring) {
          const estimate = String(fd.get("estimateHours") ?? "").trim();
          const res = await createRecurringTask({
            title,
            description: String(fd.get("description") ?? "").trim() || undefined,
            projectId: selectedProjectId,
            assigneeId: String(fd.get("assignedTo") ?? "") || null,
            priority: fd.get("priority") as "low" | "medium" | "high" | "urgent",
            isMilestone: fd.get("isMilestone") === "on",
            estimateHours: estimate ? Number(estimate) : undefined,
            frequency: repeat,
            anchorDate,
            endDate: String(fd.get("endsOn") ?? "") || null,
          });
          if (res.error) {
            setError(res.error);
            return;
          }
        } else {
          const res = await createTask({}, fd);
          if (res.error) {
            setError(res.error);
            return;
          }
          warning = res.warning;
        }
        setOpen(false);
        setRepeat("none");
        setDriveFolder(null);
        setDriveFiles([]);
        if (warning) toast.warning(warning);
        else
          toast.success(
            recurring ? "Recurring task scheduled" : "Task created"
          );
        router.refresh();
      } catch {
        setError("Couldn't create the task. Please check your internet and try again.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            size="sm"
            variant="outline"
            disabled={optimisticPending}
          />
        }
      >
        <Plus className="size-4" />
        {triggerLabel}
      </DialogTrigger>
      <DialogContent keepMounted={Boolean(onOptimisticCreate)}>
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
        </DialogHeader>
        <form ref={formRef} onSubmit={onSubmit} className="grid gap-4">
          {projectId ? (
            <input type="hidden" name="projectId" value={projectId} />
          ) : null}
          {printRunId ? (
            <input type="hidden" name="printRunId" value={printRunId} />
          ) : null}
          <input type="hidden" name="status" value={defaultStatus} />
          {driveFolder ? (
            <>
              <input
                type="hidden"
                name="driveFolderId"
                value={driveFolder.folderId}
              />
              <input
                type="hidden"
                name="driveFolderName"
                value={driveFolder.name}
              />
              <input
                type="hidden"
                name="driveFolderUrl"
                value={driveFolder.url}
              />
            </>
          ) : null}

          {!projectId && projects.length > 0 ? (
            <div className="grid gap-2">
              <Label htmlFor="t-project">Project</Label>
              <select
                id="t-project"
                name="projectId"
                className={selectClass}
                defaultValue=""
              >
                <option value="">None — general task</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor="t-title">Title</Label>
            <Input
              id="t-title"
              name="title"
              defaultValue={defaultTitle}
              required
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="t-desc">Description</Label>
            <Textarea
              id="t-desc"
              name="description"
              defaultValue={defaultDescription}
              rows={2}
            />
          </div>

          {!recurring ? (
            <>
              <TaskDriveFolderPicker
                value={driveFolder}
                onChange={setDriveFolder}
                startInFolderId={projectDriveFolderId}
                label="Drive folder (optional)"
                hint="Where finished files for this task get uploaded. You can change it later."
              />
              <TaskDriveFilesPicker
                value={driveFiles}
                onChange={setDriveFiles}
                defaultFolderId={
                  driveFolder?.folderId ?? projectDriveFolderId
                }
              />
            </>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="t-assignee">Assignee</Label>
              <select id="t-assignee" name="assignedTo" className={selectClass} defaultValue={defaultAssignee}>
                <option value="">Unassigned</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="t-priority">Priority</Label>
              <select
                id="t-priority"
                name="priority"
                className={selectClass}
                defaultValue={defaultPriority}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="t-repeat">Repeat</Label>
              <select
                id="t-repeat"
                className={selectClass}
                value={repeat}
                onChange={(e) => setRepeat(e.target.value as Repeat)}
              >
                <option value="none">Doesn&apos;t repeat</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annually</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="t-due">{recurring ? "Starts on" : "Due date"}</Label>
              <Input
                id="t-due"
                name="dueDate"
                type="date"
                required={recurring}
              />
            </div>
          </div>

          {recurring ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="t-ends">Ends on (optional)</Label>
                <Input id="t-ends" name="endsOn" type="date" />
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="t-estimate">Estimate (hrs)</Label>
              <Input
                id="t-estimate"
                name="estimateHours"
                type="number"
                min="0"
                step="0.5"
                placeholder="optional"
                className="tabular-nums"
              />
            </div>
            {phases.length > 0 && !recurring ? (
              <div className="grid gap-2">
                <Label htmlFor="t-phase">Phase</Label>
                <select id="t-phase" name="phaseId" className={selectClass} defaultValue="">
                  <option value="">None</option>
                  {phases.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isMilestone" className="size-4" />
            Mark as milestone
          </label>

          {recurring ? (
            <p className="text-xs text-muted-foreground">
              We&apos;ll create and assign this task every {REPEAT_LABEL[repeat]},
              starting on the date above.
            </p>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <DialogFooter>
            <Button type="submit" disabled={pending || optimisticPending}>
              {pending || optimisticPending
                ? "Saving…"
                : recurring
                  ? "Schedule recurring task"
                  : "Create task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
