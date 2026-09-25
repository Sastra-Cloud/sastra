import { describe, expect, it } from "vitest";

import {
  mergeTaskDriveFileSelections,
  resolveTaskDriveUploadFolderId,
} from "./drive-file-selection";

const file = (driveFileId: string, name = driveFileId) => ({
  driveFileId,
  name,
  mimeType: "application/pdf",
  iconUrl: null,
  url: `https://drive.google.com/file/d/${driveFileId}/view`,
});

describe("mergeTaskDriveFileSelections", () => {
  it("preserves existing order and appends new files", () => {
    expect(
      mergeTaskDriveFileSelections([file("a")], [file("b")]).map(
        (item) => item.driveFileId
      )
    ).toEqual(["a", "b"]);
  });

  it("deduplicates Drive files and keeps the latest metadata", () => {
    expect(
      mergeTaskDriveFileSelections(
        [file("a", "Old name")],
        [file("a", "Updated name")]
      )
    ).toEqual([file("a", "Updated name")]);
  });
});

describe("resolveTaskDriveUploadFolderId", () => {
  it("prefers the task folder, then the project folder, then the shared drive", () => {
    expect(
      resolveTaskDriveUploadFolderId("task-folder", "project-folder", "drive")
    ).toBe("task-folder");
    expect(
      resolveTaskDriveUploadFolderId(null, "project-folder", "drive")
    ).toBe("project-folder");
    expect(resolveTaskDriveUploadFolderId(null, null, "drive")).toBe("drive");
  });
});
