import { describe, expect, it } from "vitest";
import { reconcileDeletedMessages, reconcileMessageEdits, restoreDeletedMessage } from "./edit-state";
import type { ChatMessageView } from "./queries";

const message = (id: string, content = "Original") => ({ id, content, editedAt: null, reactions: [] }) as unknown as ChatMessageView;
describe("message edit reconciliation", () => {
  it("hides a pending deletion even when a poll still contains it", () => {
    expect(reconcileDeletedMessages([message("b")], [message("a"), message("b")], new Set(["a"]), new Set()).map(m => m.id)).toEqual(["b"]);
  });
  it("blocks older reads after a successful delete and accepts restored data after a failure", () => {
    expect(reconcileDeletedMessages([message("b")], [message("a"), message("b")], new Set(), new Set(["a"])).map(m => m.id)).toEqual(["b"]);
    expect(reconcileDeletedMessages([message("a")], [message("a", "Fresh")], new Set(), new Set(["a"]))[0].content).toBe("Fresh");
  });
  it("keeps an in-flight correction while accepting new reactions and attachments", () => {
    const edited = { ...message("b", "Corrected"), editedAt: "2026-10-20T12:00:00Z" };
    const fresh = { ...message("b"), reactions: [{ emoji: "🙏", count: 2, mine: false }] };
    expect(reconcileMessageEdits([edited], [fresh], new Set(["b"]))[0]).toEqual({ ...fresh, content: edited.content, editedAt: edited.editedAt });
    expect(reconcileMessageEdits([edited], [], new Set(["b"]))).toEqual([]);
  });
  it("accepts canonical edits after saving and restores a delete without overwriting other updates", () => {
    expect(reconcileMessageEdits([message("a")], [message("a", "Server edit")], new Set())[0].content).toBe("Server edit");
    const other = { ...message("c"), reactions: [{ emoji: "👍", count: 3, mine: true }] };
    expect(restoreDeletedMessage([message("a"), other], message("b"))).toEqual([message("a"), message("b"), other]);
    expect(restoreDeletedMessage([other], other)).toEqual([other]);
  });
});
