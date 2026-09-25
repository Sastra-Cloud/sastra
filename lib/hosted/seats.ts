/**
 * Seat rules for hosted workspaces. A seat is taken by an active person (not a
 * bot) or by a pending, unexpired invitation. Self-hosted installations have
 * no limit.
 */
export type SeatUsage = {
  activeHumans: number;
  pendingInvites: number;
  /** null = unlimited */
  limit: number | null;
};

export type SeatCheck = { ok: true } | { ok: false; error: string };

export function occupiedSeats(usage: SeatUsage): number {
  return usage.activeHumans + usage.pendingInvites;
}

export function seatLimitMessage(limit: number, accountUrl: string | null): string {
  const base = `Your plan includes ${limit} ${limit === 1 ? "person" : "people"}.`;
  return accountUrl
    ? `${base} Manage your plan at ${accountUrl} to add more.`
    : `${base} Contact us to add more.`;
}

/**
 * Whether one more seat can be taken. `already` is how many of the seats being
 * requested are already counted in `usage` (for example, re-sending an invite
 * to an email that already has a pending one).
 */
export function checkSeatAvailable(
  usage: SeatUsage,
  accountUrl: string | null,
  already = 0
): SeatCheck {
  if (usage.limit === null) return { ok: true };
  if (occupiedSeats(usage) - already + 1 <= usage.limit) return { ok: true };
  return { ok: false, error: seatLimitMessage(usage.limit, accountUrl) };
}
