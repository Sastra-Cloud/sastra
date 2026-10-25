import { expect, it, vi, afterEach } from "vitest";
import { readChannelDraft, saveChannelDraft } from "./channel-draft";

afterEach(() => vi.useRealTimers());

it("restores the creator's draft once across a refresh without making it available under another account's key", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  } as Storage;
  const draft = { name: "Cover review", memberIds: ["teammate-a", "teammate-b"] };
  saveChannelDraft(storage, "actor-a", draft);
  expect(readChannelDraft(storage, "actor-b")).toBeNull();
  expect(readChannelDraft(storage, "actor-a")).toEqual(draft);
  expect(readChannelDraft(storage, "actor-a")).toBeNull();
  saveChannelDraft(storage, "actor-a", draft);
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 61 * 60_000);
  expect(readChannelDraft(storage, "actor-a")).toBeNull();
});
