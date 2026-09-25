"use client";

import { confirmDialog } from "@/lib/dialog-requests";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronDown,
  CheckCircle2,
  ExternalLink,
  FileText,
  Folder,
  Loader2,
  MessageSquare,
  MailCheck,
  Paperclip,
  Repeat2,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  X,
  Undo2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import type { TaskComment, TaskRow } from "@/lib/tasks/queries";
import {
  deleteTask,
  moveTaskToProject,
  updateTaskFields,
  updateTaskStatus,
} from "@/lib/tasks/actions";
import {
  addTaskComment,
  deleteTaskComment,
  listTaskComments,
} from "@/lib/tasks/comment-actions";
import {
  clearTaskDriveFolder,
  getTaskDriveTarget,
  listTaskDriveFiles,
  removeTaskDriveFile,
  setTaskDriveFolder,
  type TaskDriveFile,
  type TaskDriveTarget,
} from "@/lib/tasks/drive-actions";
import {
  DriveAttachButton,
  DriveFolderPickerButton,
  DriveUploadButton,
} from "@/components/tasks/drive-picker";
import { offerToLearnTerms } from "@/components/tasks/learn-terms";
import { TaskTimeSection } from "@/components/tasks/task-time-section";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MentionInput } from "@/components/mentions/mention-input";
import { MentionText } from "@/components/mentions/mention-text";
import { TASK_STATUS, TASK_STATUS_ORDER } from "@/components/badges";
import { ApprovalDecisionControls } from "@/components/budget/approval-decision-controls";
import { updateBudgetApprovalTaskDueDate } from "@/lib/budget/approval-actions";
import { cn } from "@/lib/utils";
import { requestNotificationRefresh } from "@/lib/notifications/client-events";
import { undoAutoCreatedEmailTask } from "@/lib/email/task-suggestion-actions";

type Option = { id: string; name: string };
type Priority = "low" | "medium" | "high" | "urgent";

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";
const panelClass =
  "min-w-0 rounded-lg border bg-card/70 p-4 shadow-xs dark:bg-card/50";
const FOLDER_MIME = "application/vnd.google-apps.folder";

function saveErrorMessage(error: unknown) {
  if (!(error instanceof Error) || !error.message.trim()) {
    return "Couldn't save the task. Check your internet and try again.";
  }
  if (/failed to fetch|networkerror|load failed/i.test(error.message)) {
    return "Couldn't save the task. Check your internet and try again.";
  }
  return error.message;
}

type TaskDetailDialogProps = {
  task: TaskRow | null;
  assignees: Option[];
  projects?: Option[];
  currentUserId: string;
  canManage: boolean;
  onClose: () => void;
  onOptimisticUpdate?: (fields: Partial<TaskRow>) => (() => void) | undefined;
  onOptimisticDelete?: () => (() => void) | undefined;
};

/** Full task editor: fields, reassignment, status, and comments. */
export function TaskDetailDialog(props: TaskDetailDialogProps) {
  if (!props.task) return null;
  return (
    <TaskDetailDialogContent key={props.task.id} {...props} task={props.task} />
  );
}

function TaskDetailDialogContent({
  task,
  assignees,
  projects = [],
  currentUserId,
  canManage,
  onClose,
  onOptimisticUpdate,
  onOptimisticDelete,
}: TaskDetailDialogProps & { task: TaskRow }) {
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const [completionRequested, setCompletionRequested] = useState(false);
  const [comments, setComments] = useState<TaskComment[] | null>(null);
  const [loadingComments, setLoadingComments] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [commentBusy, startComment] = useTransition();
  const [driveFiles, setDriveFiles] = useState<TaskDriveFile[] | null>(null);
  const [driveTarget, setDriveTarget] = useState<TaskDriveTarget | null>(null);
  const [driveBusy, startDrive] = useTransition();

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [dueDate, setDueDate] = useState(task.dueDate ?? "");
  const [priority, setPriority] = useState<Priority>(task.priority as Priority);
  const [status, setStatus] = useState(task.status);
  const [assignedTo, setAssignedTo] = useState(task.assignedTo ?? "");
  const [projectId, setProjectId] = useState(task.projectId ?? "");
  const [isMilestone, setIsMilestone] = useState(task.isMilestone);

  useEffect(() => {
    listTaskComments(task.id)
      .then(setComments)
      .catch(() => setComments([]))
      .finally(() => setLoadingComments(false));
    listTaskDriveFiles(task.id)
      .then(setDriveFiles)
      .catch(() => setDriveFiles([]));
    getTaskDriveTarget(task.id)
      .then(setDriveTarget)
      .catch(() => setDriveTarget({ taskFolder: null, projectFolder: null }));
  }, [task.id]);

  const t = task;
  const isApprovalTask = Boolean(t.approvalAssignmentId);

  function save(statusOverride?: string) {
    if (isApprovalTask) {
      if (!canManage) return;
      if (dueDate === (t.dueDate ?? "")) {
        onClose();
        return;
      }
      const rollback = onOptimisticUpdate?.({ dueDate });
      startSave(async () => {
        try {
          const result = await updateBudgetApprovalTaskDueDate(t.id, dueDate);
          if (result.error) {
            throw new Error(result.error);
          }
          toast.success("Approval due date updated");
          requestNotificationRefresh();
          router.refresh();
          onClose();
        } catch (error) {
          rollback?.();
          toast.error(saveErrorMessage(error));
        }
      });
      return;
    }

    const nextStatus = statusOverride ?? status;
    if (statusOverride) {
      setCompletionRequested(true);
      setStatus(statusOverride);
    }
    const nextTitle = title.trim() || t.title;
    const nextDescription = description.trim() ? description.trim() : null;
    const nextDueDate = dueDate || null;
    const rollback = onOptimisticUpdate?.({
      title: nextTitle,
      description: nextDescription,
      dueDate: nextDueDate,
      priority,
      isMilestone,
      status: nextStatus,
      assignedTo: assignedTo || null,
      assigneeName: assignees.find((item) => item.id === assignedTo)?.name ?? null,
      projectId: projectId || null,
    });

    startSave(async () => {
      try {
        const fieldUpdates: Parameters<typeof updateTaskFields>[1] = {};
        if (nextTitle !== t.title) fieldUpdates.title = nextTitle;
        if (nextDescription !== (t.description ?? null)) {
          fieldUpdates.description = nextDescription;
        }
        if (nextDueDate !== (t.dueDate ?? null)) fieldUpdates.dueDate = nextDueDate;
        if (priority !== t.priority) fieldUpdates.priority = priority;
        if (isMilestone !== t.isMilestone) fieldUpdates.isMilestone = isMilestone;
        if ((assignedTo || null) !== (t.assignedTo ?? null)) {
          fieldUpdates.assignedTo = assignedTo || null;
        }
        if (Object.keys(fieldUpdates).length > 0) {
          await updateTaskFields(t.id, fieldUpdates);
        }
        if (nextStatus !== t.status) await updateTaskStatus(t.id, nextStatus);
        if ((projectId || null) !== (t.projectId ?? null)) {
          const res = await moveTaskToProject(t.id, {
            projectId: projectId || null,
          });
          if (res?.error) {
            throw new Error(res.error);
          }
        }
        if (nextTitle !== t.title) offerToLearnTerms(t.title, nextTitle);
        toast.success(statusOverride === "done" ? "Task marked done" : "Task updated");
        requestNotificationRefresh();
        router.refresh();
        onClose();
      } catch (error) {
        if (statusOverride) {
          setCompletionRequested(false);
          setStatus(status);
        }
        rollback?.();
        toast.error(saveErrorMessage(error));
      }
    });
  }

  async function removeTask() {
    if (!(await confirmDialog(`Delete task "${t.title}"? This cannot be undone.`))) return;
    startSave(async () => {
      const rollback = onOptimisticDelete?.();
      onClose();
      try {
        await deleteTask(t.id);
        router.refresh();
      } catch {
        rollback?.();
        toast.error("Couldn't delete task");
      }
    });
  }

  async function undoAutomaticTask() {
    if (!t.sourceEmailSuggestionId) return;
    if (!(await confirmDialog(`Undo the automatically created task "${t.title}"?`))) return;
    const rollback = onOptimisticDelete?.();
    onClose();
    startSave(async () => {
      try {
        const result = await undoAutoCreatedEmailTask(t.sourceEmailSuggestionId!);
        if (result.error) throw new Error(result.error);
        toast.success("Automatic task undone");
        router.refresh();
      } catch (error) {
        rollback?.();
        toast.error(saveErrorMessage(error));
      }
    });
  }

  function postComment() {
    const text = newComment.trim();
    if (!text) return;
    const temporaryId = `pending-${crypto.randomUUID()}`;
    const optimisticComment: TaskComment = {
      id: temporaryId,
      content: text,
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: currentUserId,
      authorName: "You",
      authorImage: null,
    };
    setComments((current) => [...(current ?? []), optimisticComment]);
    setNewComment("");
    startComment(async () => {
      try {
        const created = await addTaskComment(t.id, text);
        setComments((current) =>
          current?.map((comment) =>
            comment.id === temporaryId ? created : comment
          ) ?? [created]
        );
        router.refresh();
      } catch {
        setComments((current) => current?.filter((comment) => comment.id !== temporaryId) ?? []);
        setNewComment(text);
        toast.error("Couldn't post comment");
      }
    });
  }

  async function removeComment(id: string) {
    if (!(await confirmDialog("Delete this comment? This cannot be undone."))) return;
    const previous = comments;
    setComments((current) => current?.filter((comment) => comment.id !== id) ?? current);
    startComment(async () => {
      try {
        await deleteTaskComment(id);
        router.refresh();
      } catch {
        setComments(previous);
        toast.error("Couldn't delete comment");
      }
    });
  }

  function refetchDrive() {
    listTaskDriveFiles(t.id)
      .then(setDriveFiles)
      .catch(() => {});
  }

  function refetchTarget() {
    getTaskDriveTarget(t.id)
      .then(setDriveTarget)
      .catch(() => {});
  }

  function setWorkingFolder(folder: {
    folderId: string;
    name: string;
    url: string;
  }) {
    const previous = driveTarget;
    setDriveTarget((current) => ({
      taskFolder: { id: folder.folderId, name: folder.name, url: folder.url },
      projectFolder: current?.projectFolder ?? null,
    }));
    startDrive(async () => {
      try {
        await setTaskDriveFolder(t.id, folder);
        refetchTarget();
        router.refresh();
        toast.success("Task folder set");
      } catch {
        setDriveTarget(previous);
        toast.error("Couldn't set the folder");
      }
    });
  }

  function clearWorkingFolder() {
    const previous = driveTarget;
    setDriveTarget((current) => ({
      taskFolder: null,
      projectFolder: current?.projectFolder ?? null,
    }));
    startDrive(async () => {
      try {
        await clearTaskDriveFolder(t.id);
        refetchTarget();
        router.refresh();
      } catch {
        setDriveTarget(previous);
        toast.error("Couldn't clear the folder");
      }
    });
  }

  async function removeDrive(id: string) {
    const file = driveFiles?.find((item) => item.id === id);
    if (!(await confirmDialog(`Remove ${file?.name ?? "this Drive attachment"}?`))) return;
    const previous = driveFiles;
    setDriveFiles((current) => current?.filter((item) => item.id !== id) ?? current);
    startDrive(async () => {
      try {
        await removeTaskDriveFile(id);
        router.refresh();
      } catch {
        setDriveFiles(previous);
        toast.error("Couldn't remove the file");
      }
    });
  }

  return (
    <Dialog
      open={!!task}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="grid min-w-0 max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-[min(56rem,calc(100vw-3rem))] xl:max-w-[60rem]">
        <DialogHeader className="border-b bg-muted/30 px-5 py-4 sm:px-6">
          <DialogTitle>Task details</DialogTitle>
          {t.sourceRecurringTaskId ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Repeat2 className="size-3.5 text-info" />
              Recurring occurrence. Changes here affect only this occurrence;
              edit the recurring schedule on the Tasks page to correct future
              tasks.
            </p>
          ) : null}
        </DialogHeader>

        <div className="min-h-0 min-w-0 overflow-x-hidden overflow-y-auto px-5 py-5 sm:px-6">
          <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_21rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="grid min-w-0 content-start gap-5">
              {t.approvalAssignmentId && t.approvalRequestStatus ? (
                <section className="rounded-lg border border-primary/25 bg-primary/5 p-4 shadow-xs">
                  <div className="mb-3 flex items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <ShieldCheck className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold">Budget approval decision</h3>
                      <p className="text-xs text-muted-foreground">
                        Review the quotation before responding. Ordinary task controls
                        cannot record an approval decision.
                      </p>
                    </div>
                  </div>
                  {t.approvalProjectSlug ? (
                    <a
                      href={`/projects/${t.approvalProjectSlug}/budget#budget-approval`}
                      className="mb-3 inline-flex text-sm font-medium text-primary hover:underline"
                    >
                      Open current budget quotation
                    </a>
                  ) : null}
                  <ApprovalDecisionControls
                    assignmentId={t.approvalAssignmentId}
                    decision={t.approvalDecision ?? "pending"}
                    requestStatus={t.approvalRequestStatus}
                    canRespond={t.assignedTo === currentUserId}
                    onComplete={onClose}
                  />
                </section>
              ) : null}
              <section className={panelClass}>
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="d-title">Title</Label>
                    <Input
                      id="d-title"
                      value={title}
                      readOnly={isApprovalTask}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="d-desc">Description</Label>
                    <Textarea
                      id="d-desc"
                      rows={7}
                      className="min-h-36 resize-y"
                      value={description}
                      readOnly={isApprovalTask}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>
                </div>
              </section>

              {(driveFiles === null
                ? t.driveFileCount > 0
                : driveFiles.length > 0) ? (
                <section className="min-w-0 overflow-hidden rounded-lg border border-info/20 bg-info/[0.035] p-4 dark:bg-info/[0.07]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Paperclip className="size-4 text-info" />
                        <h3 className="text-sm font-semibold">Task files</h3>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Open the documents you need to complete this task.
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-background/80 px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                      {driveFiles?.length ?? t.driveFileCount}
                    </span>
                  </div>
                  {driveFiles === null ? (
                    <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" /> Loading files…
                    </p>
                  ) : (
                    <ul className="mt-3 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
                      {driveFiles.map((file) => (
                        <li key={file.id} className="min-w-0">
                          <a
                            href={file.url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="group flex min-h-11 w-full min-w-0 max-w-full items-center gap-3 overflow-hidden rounded-md bg-background px-3 py-2 ring-1 ring-inset ring-info/15 transition-colors hover:bg-info/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                          >
                            {file.iconUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={file.iconUrl}
                                alt=""
                                className="size-5 shrink-0"
                              />
                            ) : file.mimeType === FOLDER_MIME ? (
                              <Folder className="size-5 shrink-0 text-info" />
                            ) : (
                              <FileText className="size-5 shrink-0 text-info" />
                            )}
                            <span className="min-w-0 flex-1 truncate text-sm font-medium">
                              {file.name}
                            </span>
                            <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                              Open in Drive
                            </span>
                            <ExternalLink className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ) : null}

              <section className={panelClass}>
                <div className="mb-3 flex items-center gap-2">
                  <MessageSquare className="size-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Comments</h3>
                </div>
                <div className="grid gap-3">
                  {loadingComments ? (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" /> Loading…
                    </p>
                  ) : comments && comments.length > 0 ? (
                    <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
                      {comments.map((c) => (
                        <li
                          key={c.id}
                          className={cn(
                            "rounded-lg border bg-background/70 px-3 py-2 text-sm",
                            c.id.startsWith("pending-") && "optimistic-item-in"
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">
                              {c.authorName ?? "Someone"}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(c.createdAt), {
                                  addSuffix: true,
                                })}
                              </span>
                              {c.userId === currentUserId || canManage ? (
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  aria-label="Delete comment"
                                  disabled={commentBusy}
                                  onClick={() => removeComment(c.id)}
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              ) : null}
                            </div>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-pretty">
                            <MentionText
                              text={c.content}
                              members={assignees}
                              currentUserId={currentUserId}
                            />
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No comments yet.
                    </p>
                  )}
                  <div className="flex items-end gap-2">
                    <MentionInput
                      value={newComment}
                      onChange={setNewComment}
                      scope={{ projectId: t.projectId }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          postComment();
                        }
                      }}
                      placeholder="Write a comment… (@ to mention, ⌘/Ctrl+Enter to post)"
                      rows={1}
                      containerClassName="flex-1"
                      className="min-h-10 max-h-32 w-full resize-none"
                    />
                    <Button
                      size="icon"
                      aria-label="Post comment"
                      disabled={commentBusy || !newComment.trim()}
                      onClick={postComment}
                    >
                      {commentBusy ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Send className="size-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </section>
            </div>

            <aside className="grid min-w-0 content-start gap-4">
              {t.sourceEmailSuggestionId ? (
                <section className="rounded-lg border border-primary/25 bg-primary/[0.045] p-4 shadow-xs">
                  <div className="flex items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
                      <MailCheck className="size-4" />
                    </span>
                    <div className="min-w-0 space-y-1">
                      <h3 className="text-sm font-semibold">Created from a forwarded email</h3>
                      <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {t.sourceEmailSubject || "Forwarded email"}
                        {t.sourceEmailSender ? ` · ${t.sourceEmailSender}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {t.sourceEmailUrl ? (
                      <a
                        href={t.sourceEmailUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-md border bg-background px-3 text-sm font-medium text-primary hover:bg-muted"
                      >
                        {t.sourceEmailUrlLabel || "Open email link"}
                        <ExternalLink className="size-3.5" />
                      </a>
                    ) : null}
                    {canManage && t.sourceEmailThreadId ? (
                      <a
                        href={`/correspondence/${t.sourceEmailThreadId}`}
                        className="inline-flex min-h-9 items-center rounded-md px-3 text-sm font-medium hover:bg-muted"
                      >
                        View correspondence
                      </a>
                    ) : null}
                  </div>
                  {t.sourceEmailMode === "explicit_auto" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-2 text-muted-foreground"
                      disabled={saving}
                      onClick={undoAutomaticTask}
                    >
                      <Undo2 className="size-4" /> Undo automatic task
                    </Button>
                  ) : null}
                </section>
              ) : null}

              <section className={panelClass}>
                <div className="mb-3 flex items-center gap-2">
                  <SlidersHorizontal className="size-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Status & ownership</h3>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  {projects.length > 0 ? (
                    <div className="grid gap-2 sm:col-span-2 lg:col-span-1 xl:col-span-2">
                      <Label htmlFor="d-project">Project</Label>
                      <select
                        id="d-project"
                        className={selectClass}
                        value={projectId}
                        disabled={isApprovalTask}
                        onChange={(e) => setProjectId(e.target.value)}
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
                    <Label htmlFor="d-status">Status</Label>
                    <select
                      id="d-status"
                      className={selectClass}
                      value={status}
                      disabled={isApprovalTask}
                      onChange={(e) => setStatus(e.target.value)}
                    >
                      {TASK_STATUS_ORDER.map((s) => (
                        <option key={s} value={s}>
                          {TASK_STATUS[s].label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="d-assignee">Assignee</Label>
                    <select
                      id="d-assignee"
                      className={selectClass}
                      value={assignedTo}
                      disabled={isApprovalTask}
                      onChange={(e) => setAssignedTo(e.target.value)}
                    >
                      <option value="">Unassigned</option>
                      {assignees.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="d-priority">Priority</Label>
                    <select
                      id="d-priority"
                      className={selectClass}
                      value={priority}
                      disabled={isApprovalTask}
                      onChange={(e) => setPriority(e.target.value as Priority)}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="d-due">Due date</Label>
                    <Input
                      id="d-due"
                      type="date"
                      value={dueDate}
                      disabled={isApprovalTask && !canManage}
                      required={isApprovalTask && canManage}
                      onChange={(e) => setDueDate(e.target.value)}
                    />
                  </div>
                </div>

                <label className="mt-3 flex min-h-10 items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={isMilestone}
                    disabled={isApprovalTask}
                    onChange={(e) => setIsMilestone(e.target.checked)}
                  />
                  Mark as milestone
                </label>
              </section>

              {!isApprovalTask ? (
            <TaskTimeSection
              taskId={t.id}
              taskTitle={t.title}
              estimateHours={t.estimateHours}
                  currentUserId={currentUserId}
                  className={panelClass}
                />
              ) : null}

              <section className={panelClass}>
                <div className="mb-3 flex items-center gap-2">
                  <Paperclip className="size-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Manage Google Drive</h3>
                </div>
                <div className="grid gap-3">
                  {/* Working folder: default upload destination for this task. */}
                  <div className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">
                      Working folder
                    </span>
                    {driveTarget?.taskFolder ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <a
                          href={driveTarget.taskFolder.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-w-0 max-w-full items-center gap-1.5 overflow-hidden text-sm hover:underline"
                        >
                          <Folder className="size-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 truncate">
                            {driveTarget.taskFolder.name}
                          </span>
                          <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
                        </a>
                        <DriveFolderPickerButton
                          label="Change"
                          quiet
                          startInFolderId={
                            driveTarget.projectFolder?.id ??
                            driveTarget.taskFolder.id
                          }
                          onPicked={setWorkingFolder}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={driveBusy}
                          onClick={clearWorkingFolder}
                        >
                          Clear
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          {driveTarget?.projectFolder
                            ? `Uses the project folder (${driveTarget.projectFolder.name})`
                            : "Not set"}
                        </span>
                        <DriveFolderPickerButton
                          label="Set folder"
                          quiet
                          startInFolderId={driveTarget?.projectFolder?.id}
                          onPicked={setWorkingFolder}
                        />
                      </div>
                    )}
                  </div>

                  <p className="text-sm text-muted-foreground">
                    {driveFiles === null
                      ? "Checking linked files…"
                      : driveFiles.length > 0
                        ? `${driveFiles.length} file${
                            driveFiles.length === 1 ? "" : "s"
                          } linked to this task.`
                        : "No files linked yet."}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <DriveAttachButton taskId={t.id} onChange={refetchDrive} />
                    <DriveUploadButton
                      taskId={t.id}
                      quiet
                      defaultFolderId={
                        driveTarget?.taskFolder?.id ??
                        driveTarget?.projectFolder?.id ??
                        null
                      }
                      defaultFolderName={
                        driveTarget?.taskFolder?.name ??
                        driveTarget?.projectFolder?.name ??
                        null
                      }
                      projectFolderId={driveTarget?.projectFolder?.id ?? null}
                      onChange={refetchDrive}
                    />
                  </div>
                  {driveFiles && driveFiles.length > 0 ? (
                    <details className="group min-w-0 max-w-full overflow-hidden rounded-md border bg-muted/20">
                      <summary className="flex min-h-10 min-w-0 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                        Manage linked files
                        <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
                      </summary>
                      <ul className="min-w-0 max-w-full space-y-1 overflow-hidden border-t p-2">
                        {driveFiles.map((file) => (
                          <li
                            key={file.id}
                            className="flex w-full min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-md px-2 py-1.5 hover:bg-muted/50"
                          >
                            <FileText className="size-4 shrink-0 text-muted-foreground" />
                            <span className="block min-w-0 flex-1 truncate text-sm">
                              {file.name}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              className="shrink-0"
                              aria-label={`Remove ${file.name} from this task`}
                              title="Remove from task"
                              disabled={driveBusy}
                              onClick={() => removeDrive(file.id)}
                            >
                              <X className="size-4" />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </div>
              </section>
            </aside>
          </div>
        </div>

        <DialogFooter className="mx-0 mb-0 flex-col rounded-none border-t bg-muted/30 px-5 py-4 sm:flex-row sm:px-6">
          {!isApprovalTask ? (
            <>
              <Button
                variant="destructive"
                onClick={removeTask}
                disabled={saving}
                className="sm:mr-auto"
              >
                <Trash2 className="size-4" />
                Delete task
              </Button>
              <Button variant="outline" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button
                variant={status === "done" && !completionRequested ? "default" : "outline"}
                onClick={() => save()}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save changes"}
              </Button>
              {status !== "done" || completionRequested ? (
                <Button onClick={() => save("done")} disabled={saving}>
                  <CheckCircle2 className="size-4" />
                  {completionRequested ? "Marking done…" : "Mark task done"}
                </Button>
              ) : null}
            </>
          ) : canManage ? (
            <>
              <Button variant="outline" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={() => save()} disabled={saving || !dueDate}>
                {saving ? "Saving…" : "Save due date"}
              </Button>
            </>
          ) : (
            <Button onClick={onClose}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
