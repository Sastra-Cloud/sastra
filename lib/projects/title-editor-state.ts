export type ProjectTitleEditorState = {
  source: string;
  saved: string;
  draft: string;
  pending: boolean;
  error: string | null;
};

export function createProjectTitleEditorState(
  title: string
): ProjectTitleEditorState {
  return {
    source: title,
    saved: title,
    draft: title,
    pending: false,
    error: null,
  };
}

export function editProjectTitle(
  state: ProjectTitleEditorState,
  draft: string
): ProjectTitleEditorState {
  return { ...state, draft, error: null };
}

export function beginProjectTitleSave(
  state: ProjectTitleEditorState
): ProjectTitleEditorState {
  const title = state.draft.trim();
  return {
    ...state,
    saved: title,
    draft: title,
    pending: true,
    error: null,
  };
}

export function completeProjectTitleSave(
  state: ProjectTitleEditorState,
  title: string
): ProjectTitleEditorState {
  return {
    source: title,
    saved: title,
    draft: title,
    pending: false,
    error: null,
  };
}

export function failProjectTitleSave(
  state: ProjectTitleEditorState,
  error: string
): ProjectTitleEditorState {
  return {
    ...state,
    saved: state.source,
    pending: false,
    error,
  };
}

export function syncProjectTitleSource(
  state: ProjectTitleEditorState,
  title: string
): ProjectTitleEditorState {
  if (state.source === title || state.pending) return state;
  return createProjectTitleEditorState(title);
}
