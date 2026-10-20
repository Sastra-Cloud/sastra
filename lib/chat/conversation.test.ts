import { describe, expect, it } from "vitest";
import { conversationDay, conversationViewport, continuesMessageGroup, isNearConversationEnd, shouldSendConversationKey } from "./conversation";

const message = (createdAt: string, userId: string | null = "a") => ({ createdAt, userId });
describe("conversation message groups", () => {
  it("groups a sender only within five minutes, without changing message identity or order", () => {
    const first = message("2026-10-19T10:00:00Z");
    expect(continuesMessageGroup(undefined, first, "UTC")).toBe(false);
    expect(continuesMessageGroup(first, message("2026-10-19T10:05:00Z"), "UTC")).toBe(true);
    expect(continuesMessageGroup(first, message("2026-10-19T10:05:00.001Z"), "UTC")).toBe(false);
    expect(continuesMessageGroup(first, message("2026-10-19T09:59:00Z"), "UTC")).toBe(false);
    expect(continuesMessageGroup(first, message(first.createdAt, "b"), "UTC")).toBe(false);
    expect(continuesMessageGroup(message(first.createdAt, null), message(first.createdAt, null), "UTC")).toBe(false);
  });
  it("breaks at midnight in the configured display timezone", () => {
    const before = message("2026-10-19T06:59:00Z");
    const after = message("2026-10-19T07:01:00Z");
    expect(continuesMessageGroup(before, after, "America/Los_Angeles")).toBe(false);
    expect(continuesMessageGroup(before, after, "UTC")).toBe(true);
    expect(conversationDay(before.createdAt, "America/Los_Angeles")).not.toBe(conversationDay(after.createdAt, "America/Los_Angeles"));
  });
});
describe("conversation keyboard", () => {
  const enter = { key: "Enter", shiftKey: false, ctrlKey: false, metaKey: false, isComposing: false };
  it("keeps touch Return and IME confirmation out of submission", () => {
    expect(shouldSendConversationKey(enter, true)).toBe(false);
    expect(shouldSendConversationKey({ ...enter, isComposing: true }, false)).toBe(false);
    expect(shouldSendConversationKey({ ...enter, keyCode: 229 }, false)).toBe(false);
    expect(shouldSendConversationKey({ ...enter, shiftKey: true }, false)).toBe(false);
    expect(shouldSendConversationKey({ ...enter, key: "Tab" }, false)).toBe(false);
  });
  it("retains desktop Enter and supports an explicit keyboard send on touch devices", () => {
    expect(shouldSendConversationKey(enter, false)).toBe(true);
    expect(shouldSendConversationKey({ ...enter, ctrlKey: true }, true)).toBe(true);
    expect(shouldSendConversationKey({ ...enter, metaKey: true }, true)).toBe(true);
  });
});
describe("conversation viewport and scroll bounds", () => {
  it("follows a panned visual viewport, without forcing a minimum below the keyboard", () => {
    expect(conversationViewport({ height: 360, offsetTop: 40 }, 0, true)).toEqual({ top: 40, height: 360 });
    expect(conversationViewport({ height: 1000, offsetTop: 0 }, 120, false, 28)).toEqual({ top: 0, height: 852 });
    expect(conversationViewport({ height: 120, offsetTop: 0 }, 150, false, 28).height).toBe(0);
  });
  it("follows only at the end, including short content and the exact threshold", () => {
    expect(isNearConversationEnd({ scrollHeight: 1200, clientHeight: 400, scrollTop: 704 })).toBe(true);
    expect(isNearConversationEnd({ scrollHeight: 1200, clientHeight: 400, scrollTop: 703 })).toBe(false);
    expect(isNearConversationEnd({ scrollHeight: 400, clientHeight: 400, scrollTop: 0 })).toBe(true);
  });
});
