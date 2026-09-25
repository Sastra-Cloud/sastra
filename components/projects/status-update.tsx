"use client";

import { confirmDialog } from "@/lib/dialog-requests";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Check,
  Loader2,
  Pencil,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";

import type {
  EarlierUpdate,
  ProjectStatus,
} from "@/lib/projects/status-queries";
import {
  deleteProjectUpdate,
  editProjectUpdate,
  listEarlierUpdates,
  markProjectUpdateRecommendationsReviewed,
  postProjectUpdate,
  replyToProjectUpdate,
} from "@/lib/projects/status-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/ui/user-avatar";
import { MentionInput } from "@/components/mentions/mention-input";
import { MentionText } from "@/components/mentions/mention-text";
import { CreateTaskDialog } from "@/components/tasks/create-task-dialog";
import type { MentionTarget } from "@/lib/mentions/roster";
import { timeAgo } from "@/lib/format";
import { usePropState } from "@/hooks/use-prop-state";

export function ProjectStatusUpdate({
  projectId,
  slug,
  status: initialStatus,
  isManager,
  currentUserId,
  members = [],
}: {
  projectId: string;
  slug: string;
  status: ProjectStatus | null;
  isManager: boolean;
  currentUserId: string;
  members?: MentionTarget[];
}) {
  const router = useRouter();
  const [status, setStatus] = usePropState(initialStatus);
  const [busy, start] = useTransition();
  const [composing, setComposing] = useState(false);
  const [newBody, setNewBody] = useState("");
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [earlier, setEarlier] = useState<EarlierUpdate[] | null>(null);
  const [loadingEarlier, setLoadingEarlier] = useState(false);

  const post = () => {
    const b = newBody.trim();
    if (!b) return;
    const previous = status;
    const now = new Date();
    const author = members.find((member) => member.id === currentUserId);
    setStatus({
      update: {
        id: `pending-${crypto.randomUUID()}`,
        userId: currentUserId,
        authorName: author?.name ?? "You",
        authorImage: null,
        body: b,
        aiAnalysis: null,
        aiAnalyzedAt: null,
        aiReviewedAt: null,
        createdAt: now,
        updatedAt: now,
      },
      replies: [],
      earlierCount: previous ? previous.earlierCount + 1 : 0,
    });
    setNewBody("");
    setComposing(false);
    start(async () => {
      try {
        await postProjectUpdate(projectId, slug, b);
        router.refresh();
      } catch {
        setStatus(previous);
        setNewBody(b);
        setComposing(true);
        toast.error("Couldn't post the update");
      }
    });
  };

  const saveEdit = () => {
    if (!status) return;
    const b = editBody.trim();
    if (!b) return;
    const previous = status;
    setStatus((current) =>
      current
        ? {
            ...current,
            update: {
              ...current.update,
              body: b,
              updatedAt: new Date(),
              aiAnalysis: null,
              aiAnalyzedAt: null,
              aiReviewedAt: null,
            },
          }
        : current
    );
    setEditing(false);
    start(async () => {
      try {
        await editProjectUpdate(previous!.update.id, slug, b);
        router.refresh();
      } catch {
        setStatus(previous);
        setEditing(true);
        toast.error("Couldn't save the edit");
      }
    });
  };

  const remove = async (id: string) => {
    if (!(await confirmDialog("Delete this status update? This cannot be undone."))) return;
    const previous = status;
    setStatus(null);
    start(async () => {
      try {
        await deleteProjectUpdate(id, slug);
        router.refresh();
      } catch {
        setStatus(previous);
        toast.error("Couldn't delete");
      }
    });
  };

  const reply = () => {
    if (!status) return;
    const b = replyBody.trim();
    if (!b) return;
    const previous = status;
    const author = members.find((member) => member.id === currentUserId);
    setStatus((current) =>
      current
        ? {
            ...current,
            replies: [
              ...current.replies,
              {
                id: `pending-${crypto.randomUUID()}`,
                userId: currentUserId,
                authorName: author?.name ?? "You",
                authorImage: null,
                body: b,
                createdAt: new Date(),
              },
            ],
          }
        : current
    );
    setReplyBody("");
    start(async () => {
      try {
        await replyToProjectUpdate(previous!.update.id, slug, b);
        router.refresh();
      } catch {
        setStatus(previous);
        setReplyBody(b);
        toast.error("Couldn't send the reply");
      }
    });
  };

  const markRecommendationsReviewed = () => {
    if (!status) return;
    const previous = status;
    setStatus({
      ...status,
      update: { ...status.update, aiReviewedAt: new Date() },
    });
    start(async () => {
      try {
        await markProjectUpdateRecommendationsReviewed(status.update.id, slug);
        router.refresh();
      } catch {
        setStatus(previous);
        toast.error("Couldn't mark the recommendations reviewed");
      }
    });
  };

  const toggleEarlier = async () => {
    if (earlier !== null) {
      setEarlier(null);
      return;
    }
    setLoadingEarlier(true);
    try {
      setEarlier(await listEarlierUpdates(projectId));
    } finally {
      setLoadingEarlier(false);
    }
  };

  const u = status?.update;
  const canEdit = !!u && u.userId === currentUserId;
  const canDelete = !!u && (u.userId === currentUserId || isManager);
  const edited = !!u && u.updatedAt.getTime() - u.createdAt.getTime() > 1000;

  return (
    <Card id="status-update" className="scroll-mt-24">
      <CardHeader>
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Status update
          </CardTitle>
          {isManager && !composing ? (
            <Button
              size="sm"
              variant="outline"
              className="min-h-11 sm:min-h-9"
              onClick={() => {
                setNewBody("");
                setComposing(true);
              }}
            >
              {status ? "Post update" : "Post the first update"}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {composing ? (
          <div className="space-y-2">
            <MentionInput
              value={newBody}
              onChange={setNewBody}
              members={members}
              rows={3}
              autoFocus
              placeholder="Where does this project stand? (@ to mention)"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  post();
                }
              }}
            />
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setComposing(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={post} disabled={busy || !newBody.trim()}>
                Post
              </Button>
            </div>
          </div>
        ) : null}

        {!status ? (
          !composing ? (
            <p className="text-sm text-muted-foreground">
              No status update yet.
              {isManager ? "" : " A manager will post where the project stands."}
            </p>
          ) : null
        ) : (
          <>
            <div className="flex items-start gap-2.5">
              <UserAvatar
                name={status.update.authorName ?? "Someone"}
                image={status.update.authorImage}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">
                    {status.update.authorName ?? "Someone"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {timeAgo(status.update.createdAt)}
                    {edited ? " · edited" : ""}
                  </span>
                  <div className="ml-auto flex items-center gap-1">
                    {canEdit ? (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Edit update"
                        onClick={() => {
                          setEditBody(status.update.body);
                          setEditing(true);
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                    ) : null}
                    {canDelete ? (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Delete update"
                        disabled={busy}
                        onClick={() => remove(status.update.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    ) : null}
                  </div>
                </div>
                {editing ? (
                  <div className="mt-1 space-y-2">
                    <MentionInput
                      value={editBody}
                      onChange={setEditBody}
                      members={members}
                      rows={3}
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditing(false)}
                        disabled={busy}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={saveEdit}
                        disabled={busy || !editBody.trim()}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-0.5 whitespace-pre-wrap text-sm text-pretty">
                    <MentionText
                      text={status.update.body}
                      members={members}
                      currentUserId={currentUserId}
                    />
                  </p>
                )}
              </div>
            </div>

            {status.update.aiAnalysis ? (
              <div className="rounded-lg bg-muted/40 px-3 py-3 sm:px-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <Sparkles className="size-4 text-info" />
                    AI follow-up
                  </p>
                  <Badge
                    variant="outline"
                    className={
                      status.update.aiAnalysis.priority === "high"
                        ? "border-destructive/30 bg-destructive/10 text-destructive"
                        : status.update.aiAnalysis.priority === "medium"
                          ? "border-warning/30 bg-warning/15 text-warning-foreground"
                          : "text-muted-foreground"
                    }
                  >
                    {status.update.aiAnalysis.priority} priority
                  </Badge>
                  {status.update.aiReviewedAt ? (
                    <Badge variant="secondary">
                      <Check className="size-3" /> Reviewed
                    </Badge>
                  ) : null}
                  {isManager &&
                  status.update.aiAnalysis.needsManagerAttention &&
                  !status.update.aiReviewedAt ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto"
                      disabled={busy}
                      onClick={markRecommendationsReviewed}
                    >
                      <Check className="size-3.5" />
                      Mark reviewed
                    </Button>
                  ) : null}
                </div>
                <p className="mt-1.5 text-sm text-pretty">
                  {status.update.aiAnalysis.summary}
                </p>
                {status.update.aiAnalysis.recommendations.length > 0 ? (
                  <ul className="mt-2 space-y-2">
                    {status.update.aiAnalysis.recommendations.map((recommendation) => (
                      <li
                        key={`${recommendation.kind}:${recommendation.title}`}
                        className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium">
                            {recommendation.title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {recommendation.reason}
                          </p>
                        </div>
                        {isManager && recommendation.kind === "create_task" ? (
                          <CreateTaskDialog
                            projectId={projectId}
                            assignees={members.map((member) => ({
                              id: member.id,
                              name: member.name,
                            }))}
                            defaultTitle={recommendation.title}
                            defaultDescription={recommendation.reason}
                            defaultPriority={
                              status.update.aiAnalysis?.priority === "high"
                                ? "high"
                                : "medium"
                            }
                            triggerLabel="Create task"
                          />
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    No additional follow-up suggested.
                  </p>
                )}
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Advisory only · generated from this update and current project
                  records
                </p>
              </div>
            ) : isManager ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Sparkles className="size-3.5" />
                Scheduled for the next daily AI review
              </p>
            ) : null}

            {status.replies.length > 0 ? (
              <ul className="space-y-2 border-l-2 pl-3">
                {status.replies.map((r) => (
                  <li key={r.id} className="flex items-start gap-2">
                    <UserAvatar
                      name={r.authorName ?? "Someone"}
                      image={r.authorImage}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-medium text-foreground">
                          {r.authorName ?? "Someone"}
                        </span>
                        <span className="text-muted-foreground">
                          {timeAgo(r.createdAt)}
                        </span>
                        {r.userId === currentUserId || isManager ? (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label="Delete reply"
                            className="ml-auto"
                            disabled={busy}
                            onClick={() => remove(r.id)}
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        ) : null}
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-pretty">
                        <MentionText
                          text={r.body}
                          members={members}
                          currentUserId={currentUserId}
                        />
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="flex items-end gap-2">
              <MentionInput
                value={replyBody}
                onChange={setReplyBody}
                members={members}
                rows={1}
                placeholder="Reply…  (@ to mention, ⌘/Ctrl+Enter)"
                containerClassName="flex-1"
                className="max-h-32 min-h-9 w-full resize-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    reply();
                  }
                }}
              />
              <Button
                size="icon"
                aria-label="Send reply"
                disabled={busy || !replyBody.trim()}
                onClick={reply}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
              </Button>
            </div>

            {status.earlierCount > 0 ? (
              <div>
                <button
                  type="button"
                  onClick={toggleEarlier}
                  className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  {earlier !== null
                    ? "Hide earlier updates"
                    : `${status.earlierCount} earlier update${
                        status.earlierCount === 1 ? "" : "s"
                      }`}
                </button>
                {loadingEarlier ? (
                  <p className="mt-2 text-xs text-muted-foreground">Loading…</p>
                ) : null}
                {earlier ? (
                  <ul className="mt-2 space-y-2">
                    {earlier.map((e) => (
                      <li
                        key={e.id}
                        className="rounded-md border bg-card/50 px-3 py-2 text-sm"
                      >
                        <div className="text-xs text-muted-foreground">
                          {e.authorName ?? "Someone"} · {timeAgo(e.createdAt)}
                          {e.replyCount > 0
                            ? ` · ${e.replyCount} repl${
                                e.replyCount === 1 ? "y" : "ies"
                              }`
                            : ""}
                        </div>
                        <p className="mt-0.5 whitespace-pre-wrap text-pretty">
                          <MentionText
                            text={e.body}
                            members={members}
                            currentUserId={currentUserId}
                          />
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
