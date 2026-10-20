import { describe, expect, it } from "vitest";
import { conversationViewport } from "@/lib/chat/conversation";

// Project chat now uses the shared fixed mobile frame rather than measuring
// below the project hero. Desktop retains the normal document geometry.
describe("project conversation viewport", () => {
  it("uses the whole visible screen on mobile, even below an off-screen hero", () => {
    expect(conversationViewport({ height: 390, offsetTop: 0 }, 400, true)).toEqual({ top: 0, height: 390 });
  });
  it("tracks a panned keyboard viewport without adding a minimum height", () => {
    expect(conversationViewport({ height: 180, offsetTop: 60 }, 76, true)).toEqual({ top: 60, height: 180 });
  });
  it("measures below the project header on desktop", () => {
    expect(conversationViewport({ height: 844, offsetTop: 0 }, 76, false, 28).height).toBe(740);
  });
});
