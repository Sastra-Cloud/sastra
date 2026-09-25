import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TaskAttachmentShortcut } from "./task-attachment-shortcut";

describe("TaskAttachmentShortcut", () => {
  it("shows the first filename, remaining count, and direct Drive link", () => {
    const html = renderToStaticMarkup(
      <TaskAttachmentShortcut
        task={{
          driveFileCount: 3,
          driveFileName: "Translation brief.pdf",
          driveFileUrl: "https://drive.google.com/file/d/file-id/view",
        }}
      />
    );

    expect(html).toContain("Translation brief.pdf");
    expect(html).toContain("+2");
    expect(html).toContain(
      'href="https://drive.google.com/file/d/file-id/view"'
    );
    expect(html).toContain('target="_blank"');
  });

  it("renders nothing when the task has no files", () => {
    expect(
      renderToStaticMarkup(
        <TaskAttachmentShortcut
          task={{
            driveFileCount: 0,
            driveFileName: null,
            driveFileUrl: null,
          }}
        />
      )
    ).toBe("");
  });
});
