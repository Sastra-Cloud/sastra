/**
 * Control-plane deliveries are at-least-once and may arrive out of order, so an
 * entitlement event is applied only when it took effect after the one already
 * stored. Replayed event ids are refused separately, against the events table.
 */
export function isNewerEntitlement(currentEffectiveAt: Date | null, occurredAt: Date): boolean {
  if (Number.isNaN(occurredAt.getTime())) return false;
  return currentEffectiveAt === null || occurredAt.getTime() >= currentEffectiveAt.getTime();
}
