import { describe, expect, it } from "vitest";

import {
  beginProjectTitleSave,
  completeProjectTitleSave,
  createProjectTitleEditorState,
  editProjectTitle,
  failProjectTitleSave,
} from "./title-editor-state";

describe("project title editor state", () => {
  it("shows the submitted title immediately while saving", () => {
    const initial = createProjectTitleEditorState("Old project name");
    const edited = editProjectTitle(initial, "  New project name  ");
    const pending = beginProjectTitleSave(edited);

    expect(pending).toMatchObject({
      saved: "New project name",
      draft: "New project name",
      pending: true,
      error: null,
    });
  });

  it("settles on the canonical server title", () => {
    const pending = beginProjectTitleSave(
      editProjectTitle(
        createProjectTitleEditorState("Old project name"),
        "New project name"
      )
    );

    expect(completeProjectTitleSave(pending, "New project name")).toEqual({
      source: "New project name",
      saved: "New project name",
      draft: "New project name",
      pending: false,
      error: null,
    });
  });

  it("rolls the visible title back while preserving failed input", () => {
    const pending = beginProjectTitleSave(
      editProjectTitle(
        createProjectTitleEditorState("Old project name"),
        "New project name"
      )
    );

    expect(failProjectTitleSave(pending, "Could not rename the project.")).toEqual({
      source: "Old project name",
      saved: "Old project name",
      draft: "New project name",
      pending: false,
      error: "Could not rename the project.",
    });
  });
});
