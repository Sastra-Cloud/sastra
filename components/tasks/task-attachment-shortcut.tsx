"use client";

import { ExternalLink, Paperclip } from "lucide-react";

import { cn } from "@/lib/utils";

type TaskAttachmentSummary = {
  driveFileCount: number;
  driveFileName: string | null;
  driveFileUrl: string | null;
};

/**
 * Read-first shortcut shown on task cards and rows. Attachment creation and
 * removal stay in task details so the task's working file is never confused
 * with a management control.
 */
export function TaskAttachmentShortcut({
  task,
  className,
}: {
  task: TaskAttachmentSummary;
  className?: string;
}) {
  if (task.driveFileCount < 1) return null;

  const label =
    task.driveFileName ??
    `${task.driveFileCount} attached file${task.driveFileCount === 1 ? "" : "s"}`;
  const content = (
    <>
      <Paperclip className="size-3.5 shrink-0 text-info" />
      <span className="min-w-0 truncate">{label}</span>
      {task.driveFileCount > 1 ? (
        <span className="shrink-0 rounded bg-background/80 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
          +{task.driveFileCount - 1}
        </span>
      ) : null}
      {task.driveFileUrl ? (
        <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
      ) : null}
    </>
  );
  const classes = cn(
    "mt-2 inline-flex min-h-7 min-w-0 max-w-full items-center gap-1.5 overflow-hidden rounded-md bg-info/[0.07] px-2 py-1 text-xs font-medium text-foreground ring-1 ring-inset ring-info/15 transition-colors hover:bg-info/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
    className
  );

  if (!task.driveFileUrl) {
    return (
      <span className={classes} title={label}>
        {content}
      </span>
    );
  }

  return (
    <a
      href={task.driveFileUrl}
      target="_blank"
      rel="noreferrer noopener"
      className={classes}
      title={`Open ${label} in Google Drive`}
      aria-label={`Open ${label} in Google Drive${
        task.driveFileCount > 1
          ? `; ${task.driveFileCount - 1} more attached`
          : ""
      }`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {content}
    </a>
  );
}
