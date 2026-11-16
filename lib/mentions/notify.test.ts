import { expect, it, vi } from "vitest";
import { notifyMany } from "@/lib/notifications";
import { notifyMentions } from "./notify";

vi.mock("@/lib/notifications", () => ({ notifyMany: vi.fn() }));

// Reusing the shared helper for chat must not turn task comments into broadcasts.
it("keeps channel alerts opt-in while preserving personal mentions on other surfaces", async () => {
  await expect(notifyMentions({
    content: "@channel @Alex please review", actorId: "me", actorName: "Sender", link: "/tasks/task",
    members: [{ id: "me", name: "Sender" }, { id: "alex", name: "Alex" }, { id: "sam", name: "Sam" }],
  })).resolves.toEqual(["alex"]);
  expect(notifyMany).toHaveBeenCalledExactlyOnceWith(["alex"], expect.objectContaining({ type: "mention" }));
});
