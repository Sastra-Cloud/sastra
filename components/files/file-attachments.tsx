"use client";

import { confirmDialog } from "@/lib/dialog-requests";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  Loader2,
  Paperclip,
  PencilLine,
  StickyNote,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import type { Attachment } from "@/lib/files/queries";
import {
  removeAttachment,
  updateAttachmentNotes,
} from "@/lib/files/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatBytes } from "@/lib/format";
import { useOptimisticAction } from "@/hooks/use-optimistic-action";
import { usePropState } from "@/hooks/use-prop-state";

const ATTACHMENT_NOTES_MAX_LENGTH = 1000;

type AttachmentNoteUpdate = {
  attachmentId: string;
  notes: string | null;
};

function applyAttachmentNote(
  attachments: Attachment[],
  update: AttachmentNoteUpdate
) {
  return attachments.map((attachment) =>
    attachment.attachmentId === update.attachmentId
      ? { ...attachment, notes: update.notes }
      : attachment
  );
}

type TargetType =
  | "message"
  | "task"
  | "rights_item"
  | "budget_item"
  | "project"
  | "print_quote"
  | "print_payment"
  | "license_fee_payment"
  | "agreement_group";

export function FileAttachments({
  targetType,
  targetId,
  attachments,
  canEdit = true,
  label,
  emptyText = "No files yet.",
}: {
  targetType: TargetType;
  targetId: string;
  attachments: Attachment[];
  canEdit?: boolean;
  /** When set, only shows + uploads files with this label (e.g. "mou", "license"). */
  label?: string;
  /** Context-specific empty-state copy for the attachment slot. */
  emptyText?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [visibleAttachments, setVisibleAttachments] = usePropState(attachments);
  const [uploading, setUploading] = useState<string[]>([]);
  const [editingAttachmentId, setEditingAttachmentId] = useState<string | null>(
    null
  );
  const [noteDraft, setNoteDraft] = useState("");
  const [pending, start] = useTransition();
  const noteMutation = useOptimisticAction({
    state: visibleAttachments,
    update: applyAttachmentNote,
    getKey: (update: AttachmentNoteUpdate) => update.attachmentId,
  });

  const shown = label
    ? noteMutation.state.filter((a) => a.label === label)
    : noteMutation.state;

  function beginEditingNote(attachment: Attachment) {
    setEditingAttachmentId(attachment.attachmentId);
    setNoteDraft(attachment.notes ?? "");
  }

  function saveNote(attachment: Attachment) {
    const draft = noteDraft;
    const normalized = draft.trim() || null;
    setEditingAttachmentId(null);
    noteMutation.run(
      { attachmentId: attachment.attachmentId, notes: normalized },
      () => updateAttachmentNotes(attachment.attachmentId, draft),
      {
        errorMessage: `Could not save the note for ${attachment.originalName}.`,
        reconcile: (result, current) => applyAttachmentNote(current, result),
        onSuccess: () => router.refresh(),
        onError: () => {
          setEditingAttachmentId(attachment.attachmentId);
          setNoteDraft(draft);
        },
      }
    );
  }

  async function uploadOne(file: File) {
    const contentType = file.type || "application/octet-stream";
    const presign = await fetch("/api/files/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        contentType,
        sizeBytes: file.size,
      }),
    });
    if (!presign.ok) {
      const { error } = await presign.json().catch(() => ({ error: "Upload failed" }));
      throw new Error(error);
    }
    const { fileId, uploadUrl } = await presign.json();

    const put = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: file,
    });
    if (!put.ok) {
      throw new Error("Upload failed");
    }

    const complete = await fetch("/api/files/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileId, targetType, targetId, label }),
    });
    if (!complete.ok) {
      throw new Error("Could not finalize upload");
    }
  }

  async function onFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const list = Array.from(fileList);
    setUploading(list.map((f) => f.name));
    let completed = 0;
    for (const f of list) {
      try {
        await uploadOne(f);
        completed += 1;
      } catch (error) {
        toast.error(`${f.name}: ${error instanceof Error ? error.message : "Upload failed"}`);
      }
    }
    setUploading([]);
    if (inputRef.current) inputRef.current.value = "";
    if (completed > 0) {
      toast.success(completed === list.length ? "Upload complete" : `${completed} of ${list.length} files uploaded`);
      router.refresh();
    }
  }

  return (
    <div className="space-y-2">
      {shown.length === 0 && uploading.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="space-y-1.5">
          {shown.map((a) => (
            <li
              key={a.attachmentId}
              className="flex items-start gap-2 rounded-md border bg-card px-2.5 py-1.5"
            >
              <Paperclip className="mt-2 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1 py-1.5">
                <p className="truncate text-sm">{a.originalName}</p>
                {editingAttachmentId === a.attachmentId ? (
                  <div className="mt-2 space-y-2">
                    <Textarea
                      value={noteDraft}
                      onChange={(event) => setNoteDraft(event.target.value)}
                      rows={2}
                      maxLength={ATTACHMENT_NOTES_MAX_LENGTH}
                      autoFocus
                      className="min-h-20"
                      aria-label={`Note for ${a.originalName}`}
                      placeholder="Add context, version details, or follow-up instructions"
                      onKeyDown={(event) => {
                        if (
                          event.key === "Enter" &&
                          (event.metaKey || event.ctrlKey)
                        ) {
                          event.preventDefault();
                          saveNote(a);
                        }
                        if (event.key === "Escape") {
                          setEditingAttachmentId(null);
                          setNoteDraft("");
                        }
                      }}
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {noteDraft.length}/{ATTACHMENT_NOTES_MAX_LENGTH}
                      </span>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingAttachmentId(null);
                            setNoteDraft("");
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={noteDraft.trim() === (a.notes ?? "")}
                          onClick={() => saveNote(a)}
                        >
                          Save note
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : a.notes ? (
                  canEdit ? (
                    <button
                      type="button"
                      disabled={noteMutation.isPending(a.attachmentId)}
                      onClick={() => beginEditingNote(a)}
                      className="mt-1 flex min-h-8 max-w-full items-start gap-1.5 rounded-sm text-left text-xs leading-5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11"
                    >
                      {noteMutation.isPending(a.attachmentId) ? (
                        <Loader2 className="mt-1 size-3 shrink-0 animate-spin" />
                      ) : (
                        <StickyNote className="mt-1 size-3 shrink-0" />
                      )}
                      <span className="line-clamp-2 whitespace-pre-wrap">
                        {a.notes}
                      </span>
                      <PencilLine className="mt-1 size-3 shrink-0" />
                    </button>
                  ) : (
                    <p className="mt-1 flex items-start gap-1.5 text-xs leading-5 text-muted-foreground">
                      <StickyNote className="mt-1 size-3 shrink-0" />
                      <span className="whitespace-pre-wrap">{a.notes}</span>
                    </p>
                  )
                ) : canEdit ? (
                  <button
                    type="button"
                    onClick={() => beginEditingNote(a)}
                    className="mt-1 flex min-h-8 items-center gap-1.5 rounded-sm text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11"
                  >
                    <StickyNote className="size-3" />
                    Add note
                  </button>
                ) : null}
              </div>
              <span className="hidden shrink-0 py-2 text-xs tabular-nums text-muted-foreground sm:inline">
                {formatBytes(a.sizeBytes)}
              </span>
              <a
                href={`/api/files/${a.fileId}/download`}
                className="grid size-10 shrink-0 place-items-center text-muted-foreground hover:text-foreground sm:size-8"
                aria-label={`Download ${a.originalName}`}
              >
                <Download className="size-4" />
              </a>
              {canEdit ? (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="size-10 sm:size-8"
                  aria-label="Remove file"
                  disabled={pending || noteMutation.isPending(a.attachmentId)}
                  onClick={async () => {
                    if (!(await confirmDialog(`Remove ${a.originalName}?`))) return;
                    const previous = visibleAttachments;
                    setVisibleAttachments((current) =>
                      current.filter((item) => item.attachmentId !== a.attachmentId)
                    );
                    start(async () => {
                      try {
                        await removeAttachment(a.attachmentId);
                        router.refresh();
                      } catch {
                        setVisibleAttachments(previous);
                        toast.error(`Could not remove ${a.originalName}.`);
                      }
                    });
                  }}
                >
                  <X className="size-4" />
                </Button>
              ) : null}
            </li>
          ))}
          {uploading.map((name) => (
            <li
              key={name}
              className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-muted-foreground"
            >
              <Loader2 className="size-4 shrink-0 animate-spin" />
              <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
              <span className="text-xs">uploading…</span>
            </li>
          ))}
        </ul>
      )}

      {canEdit ? (
        <>
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => onFiles(e.target.files)}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={uploading.length > 0}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="size-4" />
            Upload files
          </Button>
        </>
      ) : null}
    </div>
  );
}
