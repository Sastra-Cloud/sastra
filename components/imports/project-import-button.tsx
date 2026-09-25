"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { createImportsForProject } from "@/lib/imports/actions";
import { uploadFile } from "@/lib/files/upload-client";
import { Button } from "@/components/ui/button";

const ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,application/pdf,image/png,image/jpeg," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document," +
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * "Update from document" — upload one or more docs to merge into this existing
 * project. Multiple documents are reviewed one after another; applying each one
 * advances to the next.
 */
export function ProjectImportButton({
  projectId,
  className,
}: {
  projectId: string;
  className?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null
  );

  async function onFiles(fileList: FileList | null) {
    const chosen = fileList ? Array.from(fileList) : [];
    if (chosen.length === 0) return;

    setProgress({ done: 0, total: chosen.length });
    // Upload sequentially so the progress count is truthful; a failed upload is
    // toasted by uploadFile and skipped, leaving the rest to continue.
    const fileIds: string[] = [];
    for (const file of chosen) {
      const fileId = await uploadFile(file);
      if (fileId) fileIds.push(fileId);
      setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
    }
    if (inputRef.current) inputRef.current.value = "";
    if (fileIds.length === 0) {
      setProgress(null);
      return;
    }

    const res = await createImportsForProject(fileIds, projectId);
    if (res.error || !res.firstImportId) {
      toast.error(res.error ?? "Could not start the import.");
      setProgress(null);
      return;
    }
    if (fileIds.length > 1) {
      toast.message(
        `Reading ${fileIds.length} documents — review each in turn.`
      );
    }
    router.push(`/projects/import/${res.firstImportId}`);
  }

  const busy = progress !== null;
  const label =
    progress && progress.total > 1
      ? `Uploading ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…`
      : "Uploading…";

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        hidden
        multiple
        accept={ACCEPT}
        onChange={(e) => onFiles(e.target.files)}
      />
      <Button
        variant="outline"
        size="sm"
        className={className}
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {label}
          </>
        ) : (
          <>
            <FileUp className="size-4" />
            Update from document
          </>
        )}
      </Button>
    </>
  );
}
