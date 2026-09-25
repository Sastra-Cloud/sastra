"use client";

import { confirmDialog } from "@/lib/dialog-requests";

import { useState, useTransition } from "react";
import {
  Check,
  MessageSquareText,
  Pencil,
  Reply,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  addProjectSurfaceNote,
  deleteProjectSurfaceNote,
  editProjectSurfaceNote,
  replyToProjectSurfaceNote,
} from "@/lib/projects/surface-notes-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MentionInput } from "@/components/mentions/mention-input";
import { MentionText } from "@/components/mentions/mention-text";
import type { MentionTarget } from "@/lib/mentions/roster";
import { cn } from "@/lib/utils";
import { usePropState } from "@/hooks/use-prop-state";

type Surface = "budget" | "rights";

type BaseSurfaceNoteDTO = {
  id: string;
  userId: string | null;
  authorName: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type SurfaceReplyDTO = BaseSurfaceNoteDTO;

export type SurfaceNoteDTO = BaseSurfaceNoteDTO & {
  replies: SurfaceReplyDTO[];
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function ProjectSurfaceNotes({
  projectId,
  slug,
  surface,
  title,
  emptyText,
  notes: initialNotes,
  currentUserId,
  canModerate,
  members = [],
}: {
  projectId: string;
  slug: string;
  surface: Surface;
  title: string;
  emptyText: string;
  notes: SurfaceNoteDTO[];
  currentUserId: string;
  canModerate: boolean;
  members?: MentionTarget[];
}) {
  const [pending, start] = useTransition();
  const [notes, setNotes] = usePropState(initialNotes);
  const [body, setBody] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");

  function run(
    action: () => Promise<unknown>,
    success?: string,
    rollback?: () => void
  ) {
    start(async () => {
      try {
        await action();
        if (success) toast.success(success);
      } catch (error) {
        rollback?.();
        const message =
          error instanceof Error
            ? error.message
            : "Couldn't save your note. Please try again.";
        toast.error(message);
      }
    });
  }

  function submitNote() {
    const text = body.trim();
    if (!text) return;
    const temporaryId = `pending-${crypto.randomUUID()}`;
    const previous = notes;
    const now = new Date().toISOString();
    setNotes((current) => [
      {
        id: temporaryId,
        userId: currentUserId,
        authorName: "You",
        body: text,
        createdAt: now,
        updatedAt: now,
        replies: [],
      },
      ...current,
    ]);
    setBody("");
    run(() => addProjectSurfaceNote(projectId, slug, surface, text), undefined, () => {
      setNotes(previous);
      setBody(text);
    });
  }

  function submitReply(noteId: string) {
    const text = replyBody.trim();
    if (!text) return;
    const previous = notes;
    const temporaryId = `pending-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    setNotes((current) =>
      current.map((note) =>
        note.id === noteId
          ? {
              ...note,
              replies: [
                ...note.replies,
                {
                  id: temporaryId,
                  userId: currentUserId,
                  authorName: "You",
                  body: text,
                  createdAt: now,
                  updatedAt: now,
                },
              ],
            }
          : note
      )
    );
    setReplyBody("");
    setReplyingTo(null);
    run(() => replyToProjectSurfaceNote(noteId, slug, surface, text), undefined, () => {
      setNotes(previous);
      setReplyBody(text);
      setReplyingTo(noteId);
    });
  }

  function saveEdit(noteId: string) {
    const text = editBody.trim();
    if (!text) return;
    const previous = notes;
    const updatedAt = new Date().toISOString();
    setNotes((current) =>
      current.map((note) =>
        note.id === noteId
          ? { ...note, body: text, updatedAt }
          : {
              ...note,
              replies: note.replies.map((reply) =>
                reply.id === noteId ? { ...reply, body: text, updatedAt } : reply
              ),
            }
      )
    );
    setEditingId(null);
    setEditBody("");
    run(() => editProjectSurfaceNote(noteId, slug, surface, text), undefined, () => {
      setNotes(previous);
      setEditingId(noteId);
      setEditBody(text);
    });
  }

  async function remove(noteId: string) {
    if (!(await confirmDialog("Delete this note?"))) return;
    const previous = notes;
    setNotes((current) =>
      current
        .filter((note) => note.id !== noteId)
        .map((note) => ({
          ...note,
          replies: note.replies.filter((reply) => reply.id !== noteId),
        }))
    );
    run(
      () => deleteProjectSurfaceNote(noteId, slug, surface),
      undefined,
      () => setNotes(previous)
    );
  }

  function startEdit(note: SurfaceReplyDTO) {
    setEditingId(note.id);
    setEditBody(note.body);
    setReplyingTo(null);
  }

  function renderNote(note: SurfaceNoteDTO | SurfaceReplyDTO, reply = false) {
    const canEdit = note.userId === currentUserId;
    const canDelete = canEdit || canModerate;
    const isEditing = editingId === note.id;
    const edited = note.updatedAt !== note.createdAt;

    return (
      <div
        key={note.id}
        className={cn(
          "space-y-2 rounded-lg border bg-background p-3",
          note.id.startsWith("pending-") && "optimistic-item-in",
          reply && "border-l-2"
        )}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {note.authorName || "Team member"}
          </span>
          <span>{formatDate(note.createdAt)}</span>
          {edited ? <span>edited</span> : null}
        </div>

        {isEditing ? (
          <div className="space-y-2">
            <MentionInput
              value={editBody}
              onChange={setEditBody}
              members={members}
              rows={3}
              disabled={pending}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => {
                  setEditingId(null);
                  setEditBody("");
                }}
              >
                <X className="size-3.5" />
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={pending || !editBody.trim()}
                onClick={() => saveEdit(note.id)}
              >
                <Check className="size-3.5" />
                Save
              </Button>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-6 text-pretty">
            <MentionText
              text={note.body}
              members={members}
              currentUserId={currentUserId}
            />
          </p>
        )}

        {!isEditing ? (
          <div className="flex flex-wrap items-center gap-1">
            {!reply ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => {
                  setReplyingTo(replyingTo === note.id ? null : note.id);
                  setReplyBody("");
                  setEditingId(null);
                }}
              >
                <Reply className="size-3.5" />
                Reply
              </Button>
            ) : null}
            {canEdit ? (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Edit note"
                disabled={pending}
                onClick={() => startEdit(note)}
              >
                <Pencil className="size-3.5" />
              </Button>
            ) : null}
            {canDelete ? (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Delete note"
                disabled={pending}
                onClick={() => remove(note.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            ) : null}
          </div>
        ) : null}

        {!reply && replyingTo === note.id ? (
          <div className="space-y-2 border-t pt-3">
            <MentionInput
              value={replyBody}
              onChange={setReplyBody}
              members={members}
              rows={2}
              placeholder="Write a reply... (@ to mention)"
              disabled={pending}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => {
                  setReplyingTo(null);
                  setReplyBody("");
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={pending || !replyBody.trim()}
                onClick={() => submitReply(note.id)}
              >
                <Send className="size-3.5" />
                Reply
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 py-4">
        <div className="flex items-center gap-2">
          <MessageSquareText className="size-4 text-muted-foreground" />
          <h2 className="font-display text-base font-semibold">{title}</h2>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <MentionInput
            value={body}
            onChange={setBody}
            members={members}
            scope={{ projectId }}
            placeholder="Add a note... (@ to mention)"
            rows={3}
            disabled={pending}
            containerClassName="flex-1"
            className="min-h-20"
          />
          <Button
            className="sm:mt-0"
            disabled={pending || !body.trim()}
            onClick={submitNote}
          >
            <Send className="size-4" />
            Add note
          </Button>
        </div>

        {notes.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
            {emptyText}
          </p>
        ) : (
          <div className="space-y-3">
            {notes.map((note) => (
              <div key={note.id} className="space-y-2">
                {renderNote(note)}
                {note.replies.length > 0 ? (
                  <div className="ml-4 space-y-2 border-l pl-3">
                    {note.replies.map((reply) => renderNote(reply, true))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
