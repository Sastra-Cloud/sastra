"use client";

import { useState } from "react";
import {
  ExternalLink,
  Download,
  FileImage,
  FileSpreadsheet,
  FileText,
  Loader2,
  Paperclip,
} from "lucide-react";

import { formatBytes } from "@/lib/format";
import { fetchDownload } from "@/lib/files/fetch-download";
import { fileLinkAttributes } from "@/lib/files/link-attributes";
import { FileLink } from "@/components/files/file-link";
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

/** Start a browser download from a link the page does not show. */
function saveWithLink(href: string, fileName?: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = fileName ?? "";
  document.body.append(link);
  link.click();
  link.remove();
}

const attachmentKey = (attachment: OutgoingEmailAttachment) =>
  `${attachment.name}-${attachment.previewUrl}`;

export function OutgoingAttachmentReview({
  attachments,
  helperText = "These exact files will be sent with this email.",
  ariaLabel = "Email attachments",
}: {
  attachments: OutgoingEmailAttachment[];
  helperText?: string;
  ariaLabel?: string;
}) {
  const [selectedKey, setSelected] = useState<string | null>(null);
  const selected = attachments.find((attachment) => attachmentKey(attachment) === selectedKey) ?? null;
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadErrors, setDownloadErrors] = useState<Record<string, string>>({});

  if (attachments.length === 0) return null;

  const previewUrl = selected ? fileLinkAttributes(selected.previewUrl, "preview").href : "";

  // Files the browser cannot show are downloaded from the row. The request is
  // read first so a refused download shows a message instead of saving an
  // error file.
  async function download(attachment: OutgoingEmailAttachment) {
    const key = attachmentKey(attachment);
    if (downloading) return;
    setDownloading(key);
    setDownloadErrors((current) =>
      Object.fromEntries(Object.entries(current).filter(([k]) => k !== key)),
    );
    const result = await fetchDownload(attachment.previewUrl);
    if (result.status === "ready") {
      const objectUrl = URL.createObjectURL(result.blob);
      saveWithLink(objectUrl, attachment.name);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } else if (result.status === "unreadable") {
      saveWithLink(attachment.previewUrl);
    } else {
      setDownloadErrors((current) => ({ ...current, [key]: result.error }));
    }
    setDownloading(null);
  }

  return (
    <>
      <section
        aria-label={ariaLabel}
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
              {helperText}
            </p>
          </div>
        </div>
        <ul className="divide-y">
          {attachments.map((attachment) => {
            const key = attachmentKey(attachment);
            return (
              <AttachmentRow
                key={key}
                attachment={attachment}
                busy={downloading === key}
                error={downloadErrors[key]}
                onPreview={() => setSelected(attachmentKey(attachment))}
                onDownload={() => void download(attachment)}
              />
            );
          })}
        </ul>
      </section>

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="flex h-[min(90dvh,56rem)] min-h-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(64rem,calc(100vw-3rem))]">
          {selected ? (
            <>
              <DialogHeader className="min-w-0 shrink-0 border-b px-4 py-3 pr-12">
                <DialogTitle className="truncate" title={selected.name}>
                  {selected.name}
                </DialogTitle>
                <DialogDescription>
                  This is the attachment that will be sent with the email.
                </DialogDescription>
              </DialogHeader>

              {selected.mimeType.startsWith("image/") ? (
                <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-muted/30 p-4">
                  {/* The source is an authenticated application route, not user HTML. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt={`Preview of ${selected.name}`}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              ) : (
                <iframe
                  src={previewUrl}
                  title={`Preview of ${selected.name}`}
                  className="min-h-0 w-full flex-1 bg-white"
                />
              )}

              <DialogFooter className="m-0 shrink-0">
                <Button
                  nativeButton={false}
                  type="button"
                  variant="outline"
                  render={<FileLink href={selected.previewUrl} intent="preview" />}
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

function AttachmentRow({
  attachment,
  busy,
  error,
  onPreview,
  onDownload,
}: {
  attachment: OutgoingEmailAttachment;
  busy: boolean;
  error?: string;
  onPreview: () => void;
  onDownload: () => void;
}) {
  return (
    <li className="px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <AttachmentIcon mimeType={attachment.mimeType} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={attachment.name}>
            {attachment.name}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {attachmentKind(attachment.mimeType)}
            {attachment.sizeBytes != null
              ? ` · ${formatBytes(attachment.sizeBytes)}`
              : ""}
            {attachment.description ? ` · ${attachment.description}` : ""}
          </p>
        </div>
        {canPreviewInline(attachment.mimeType) ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            aria-label={`Preview ${attachment.name}`}
            onClick={onPreview}
          >
            Preview
          </Button>
        ) : (
          // The browser cannot show this file, so skip the preview window.
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            aria-label={`Download ${attachment.name}`}
            disabled={busy}
            onClick={onDownload}
          >
            {busy ? (
              <Loader2
                className="size-4 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : (
              <Download className="size-4" aria-hidden="true" />
            )}
            {busy ? "Downloading…" : "Download"}
          </Button>
        )}
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </li>
  );
}
