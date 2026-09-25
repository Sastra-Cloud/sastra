export type TaskDriveFileSelection = {
  driveFileId: string;
  name: string;
  mimeType: string | null;
  iconUrl: string | null;
  url: string;
};

/** Merge Picker results without listing the same Drive item twice. */
export function mergeTaskDriveFileSelections(
  current: TaskDriveFileSelection[],
  incoming: TaskDriveFileSelection[]
): TaskDriveFileSelection[] {
  const byId = new Map(
    current.map((file) => [file.driveFileId, file] as const)
  );
  for (const file of incoming) byId.set(file.driveFileId, file);
  return [...byId.values()];
}

/** Pick a direct upload destination without forcing a folder-selection step. */
export function resolveTaskDriveUploadFolderId(
  taskFolderId: string | null,
  projectFolderId: string | null,
  sharedDriveId: string | null
): string | null {
  return taskFolderId ?? projectFolderId ?? sharedDriveId;
}
