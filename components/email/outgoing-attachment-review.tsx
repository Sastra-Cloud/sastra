"use client";

import { useState } from "react";
import {
  ExternalLink,
  FileImage,
  FileSpreadsheet,
  FileText,
  Paperclip,
} from "lucide-react";

import { formatBytes } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type OutgoingEmailAttachment = {
  name: string;
  mimeType: string;
  previewUrl: string;
  sizeBytes?: number | null;
  description?: string;
};

function attachmentKind(mimeType: string) {
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType.startsWith("image/")) return "Image";
  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.ms-excel"
  ) {
    return "Excel spreadsheet";
  }
  return "File";
}

function AttachmentIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith("image/")) {
    return <FileImage className="size-4" aria-hidden="true" />;
  }
  if (attachmentKind(mimeType) === "Excel spreadsheet") {
    return <FileSpreadsheet className="size-4" aria-hidden="true" />;
  }
  return <FileText className="size-4" aria-hidden="true" />;
}

function canPreviewInline(mimeType: string) {
  return (
    mimeType === "application/pdf" ||
    mimeType.startsWith("image/") ||
    mimeType.startsWith("text/")
  );
}

export function OutgoingAttachmentReview({
  attachments,
}: {
  attachments: OutgoingEmailAttachment[];
}) {
  const [selected, setSelected] = useState<OutgoingEmailAttachment | null>(null);

  if (attachments.length === 0) return null;

  const inline = selected ? canPreviewInline(selected.mimeType) : false;

  return (
    <>
      <section
        aria-label="Email attachments"
        className="overflow-hidden rounded-lg border bg-background"
      >
        <div className="flex items-start gap-2 border-b bg-muted/30 px-3 py-2.5">
          <Paperclip
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {attachments.length === 1
                ? "1 attachment"
                : `${attachments.length} attachments`}
            </p>
            <p className="text-xs text-muted-foreground">
              These exact files will be sent with this email.
            </p>
          </div>
        </div>
        <ul className="divide-y">
          {attachments.map((attachment) => (
            <li
              key={`${attachment.name}-${attachment.previewUrl}`}
              className="flex min-w-0 items-center gap-3 px-3 py-2.5"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <AttachmentIcon mimeType={attachment.mimeType} />
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-sm font-medium"
                  title={attachment.name}
                >
                  {attachment.name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {attachmentKind(attachment.mimeType)}
                  {attachment.sizeBytes != null
                    ? ` · ${formatBytes(attachment.sizeBytes)}`
                    : ""}
                  {attachment.description
                    ? ` · ${attachment.description}`
                    : ""}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                aria-label={`Preview ${attachment.name}`}
                onClick={() => setSelected(attachment)}
              >
                Preview
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-hidden p-0 sm:max-w-[min(64rem,calc(100vw-3rem))]">
          {selected ? (
            <>
              <DialogHeader className="min-w-0 border-b px-4 py-3 pr-12">
                <DialogTitle className="truncate" title={selected.name}>
                  {selected.name}
                </DialogTitle>
                <DialogDescription>
                  This is the attachment that will be sent with the email.
                </DialogDescription>
              </DialogHeader>

              {inline ? (
                selected.mimeType.startsWith("image/") ? (
                  <div className="flex max-h-[70dvh] min-h-72 items-center justify-center overflow-auto bg-muted/30 p-4">
                    {/* The source is an authenticated application route, not user HTML. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={selected.previewUrl}
                      alt={`Preview of ${selected.name}`}
                      className="max-h-[66dvh] max-w-full object-contain"
                    />
                  </div>
                ) : (
                  <iframe
                    src={selected.previewUrl}
                    title={`Preview of ${selected.name}`}
                    className="h-[70dvh] min-h-72 w-full bg-white"
                  />
                )
              ) : (
                <div className="flex min-h-72 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
                  <span className="flex size-12 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <AttachmentIcon mimeType={selected.mimeType} />
                  </span>
                  <div className="max-w-md space-y-1">
                    <p className="font-medium">
                      {attachmentKind(selected.mimeType)} preview
                    </p>
                    <p className="text-sm text-muted-foreground">
                      This file type cannot be displayed inside Sastra. Open the
                      exact attachment in a new tab to inspect it before
                      sending.
                    </p>
                  </div>
                </div>
              )}

              <DialogFooter className="m-0">
                <Button
                  type="button"
                  variant="outline"
                  render={
                    <a
                      href={selected.previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    />
                  }
                >
                  <ExternalLink className="size-4" />
                  Open attachment
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
