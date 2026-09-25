import { describe, expect, it } from "vitest";

import { checkSeatAvailable, occupiedSeats, seatLimitMessage } from "./seats";

describe("seats", () => {
  it("counts active people and pending invitations", () => {
    expect(occupiedSeats({ activeHumans: 9, pendingInvites: 3, limit: 15 })).toBe(12);
  });

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

  it("points hosted customers at their account page", () => {
    expect(seatLimitMessage(15, "https://account.example.cloud")).toBe(
      "Your plan includes 15 people. Manage your plan at https://account.example.cloud to add more."
    );
    expect(seatLimitMessage(1, null)).toBe("Your plan includes 1 person. Contact us to add more.");
  });
});
