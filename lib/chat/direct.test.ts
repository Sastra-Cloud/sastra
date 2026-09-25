import { describe, expect, it } from "vitest";

import { directConversationKey } from "./direct";

describe("directConversationKey", () => {
  it("is identical regardless of which teammate starts the conversation", () => {
    expect(directConversationKey("user-alpha", "user-beta")).toBe(
      directConversationKey("user-beta", "user-alpha")
    );
  });

  it("does not collide when ids contain separators", () => {
    expect(directConversationKey("ab", "c:d")).not.toBe(
      directConversationKey("ab:c", "d")
    );
  });
});
