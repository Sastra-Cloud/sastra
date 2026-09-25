"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { createImportFromFile } from "@/lib/imports/actions";
import { uploadFile } from "@/lib/files/upload-client";
import { Button } from "@/components/ui/button";

const ACCEPT =
  ".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,application/pdf," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document," +
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function ImportUploader() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string[]>([]);

  /** Upload one file to R2 and create an import draft; returns the import id. */
  async function uploadOne(file: File): Promise<string | null> {
    const fileId = await uploadFile(file);
    if (!fileId) return null;
    const res = await createImportFromFile(fileId);
    if (res.error) {
      toast.error(`${file.name}: ${res.error}`);
      return null;
    }
    return res.importId ?? null;
  }

  async function onFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const list = Array.from(fileList);
    setUploading(list.map((f) => f.name));
    const ids: string[] = [];
    for (const f of list) {
      const id = await uploadOne(f);
      if (id) ids.push(id);
    }
    setUploading([]);
    if (inputRef.current) inputRef.current.value = "";

    if (ids.length === 1) {
      router.push(`/projects/import/${ids[0]}`);
    } else if (ids.length > 1) {
      toast.success(`${ids.length} documents uploaded`);
      router.refresh();
    }
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        accept={ACCEPT}
        onChange={(e) => onFiles(e.target.files)}
      />
      <Button
        disabled={uploading.length > 0}
        onClick={() => inputRef.current?.click()}
      >
        {uploading.length > 0 ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Uploading {uploading.length}…
          </>
        ) : (
          <>
            <Upload className="size-4" />
            Upload documents
          </>
        )}
      </Button>
      <p className="text-sm text-muted-foreground">
        PDF, Word, or Excel. Each document becomes a draft you review before any
        project is created.
      </p>
    </div>
  );
}
