"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Folder, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { DriveFolderPickerButton } from "@/components/tasks/drive-picker";
import {
  clearProjectDriveFolder,
  setProjectDriveFolder,
} from "@/lib/projects/drive-actions";
import { Button } from "@/components/ui/button";
import { usePropState } from "@/hooks/use-prop-state";

type FolderRef = { id: string; name: string; url: string };

/** Overview card: link / open / change a project's main Google Drive folder. */
export function ProjectDriveFolder({
  projectId,
  folder,
  isManager,
}: {
  projectId: string;
  folder: FolderRef | null;
  isManager: boolean;
}) {
  const router = useRouter();
  const [busy, startBusy] = useTransition();
  const [visibleFolder, setVisibleFolder] = usePropState(folder);

  function onPicked(f: { folderId: string; name: string; url: string }) {
    const previous = visibleFolder;
    setVisibleFolder({ id: f.folderId, name: f.name, url: f.url });
    startBusy(async () => {
      try {
        await setProjectDriveFolder(projectId, f);
        toast.success("Drive folder linked");
        router.refresh();
      } catch {
        setVisibleFolder(previous);
        toast.error("Couldn't link the folder");
      }
    });
  }

  function onClear() {
    const previous = visibleFolder;
    setVisibleFolder(null);
    startBusy(async () => {
      try {
        await clearProjectDriveFolder(projectId);
        toast.success("Drive folder removed");
        router.refresh();
      } catch {
        setVisibleFolder(previous);
        toast.error("Couldn't remove the folder");
      }
    });
  }

  if (!visibleFolder) {
    if (!isManager) {
      return (
        <p className="text-sm text-muted-foreground">No Drive folder linked.</p>
      );
    }
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Link this project&apos;s Google Drive folder so the team can open it
          and upload finished files straight from tasks.
        </p>
        <DriveFolderPickerButton label="Link Drive folder" onPicked={onPicked} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <a
        href={visibleFolder.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-w-0 max-w-full items-center gap-2 text-sm hover:underline"
      >
        <Folder className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate">{visibleFolder.name}</span>
        <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
      </a>
      {isManager ? (
        <div className="flex flex-wrap items-center gap-2">
          <DriveFolderPickerButton label="Change" onPicked={onPicked} />
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={onClear}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Clear
          </Button>
        </div>
      ) : null}
    </div>
  );
}
