import { describe, expect, it } from "vitest";

import { checkSeatAvailable } from "./seats";

describe("seats", () => {

  it("never limits self-hosted installations", () => {
    expect(checkSeatAvailable({ activeHumans: 500, pendingInvites: 20, limit: null }, null)).toEqual({
      ok: true,
    });
  });

  it("allows the last seat and refuses the one after", () => {
    expect(checkSeatAvailable({ activeHumans: 14, pendingInvites: 0, limit: 15 }, null)).toEqual({ ok: true });
    const refused = checkSeatAvailable({ activeHumans: 15, pendingInvites: 0, limit: 15 }, null);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toBe("Your plan includes 15 people. Contact us to add more.");
  });

  it("does not double-count a seat that is being replaced", () => {
    // 15 seats used, one of them the pending invite being re-sent.
    expect(checkSeatAvailable({ activeHumans: 10, pendingInvites: 5, limit: 15 }, null, 1)).toEqual({ ok: true });
  });
});
