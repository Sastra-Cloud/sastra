export type ChannelDraft = { name: string; memberIds: string[] };
const MAX_AGE = 60 * 60 * 1000;

/** Only this form's draft, in this tab, for this signed-in teammate. Never replay it. */
export function saveChannelDraft(storage: Storage, key: string, draft: ChannelDraft) {
  storage.setItem(key, JSON.stringify({ ...draft, savedAt: Date.now() }));
}

export function readChannelDraft(storage: Storage, key: string): ChannelDraft | null {
  const raw = storage.getItem(key);
  if (!raw) return null;
  storage.removeItem(key);
  try {
    const draft = JSON.parse(raw);
    if (typeof draft.savedAt !== "number" || Date.now() - draft.savedAt > MAX_AGE ||
        draft.savedAt > Date.now() || typeof draft.name !== "string" || draft.name.length > 60 ||
        !Array.isArray(draft.memberIds) || draft.memberIds.length > 200 ||
        !draft.memberIds.every((id: unknown) => typeof id === "string")) return null;
    return { name: draft.name, memberIds: draft.memberIds };
  } catch { return null; }
}
