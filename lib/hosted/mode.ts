/**
 * Hosted mode is on when the control plane provisioned this instance. Without
 * `SASTRA_CLOUD_INSTANCE_ID` the app is self-hosted: no seat limit, no credit
 * cap, and the management API is switched off.
 */
export function hostedInstanceId(env: Record<string, string | undefined> = process.env): string | null {
  return env.SASTRA_CLOUD_INSTANCE_ID?.trim() || null;
}

export function isHostedInstance(env: Record<string, string | undefined> = process.env): boolean {
  return hostedInstanceId(env) !== null;
}

/** Where a hosted customer manages their plan; shown in seat-limit messages. */
export function hostedAccountUrl(env: Record<string, string | undefined> = process.env): string | null {
  return env.SASTRA_CLOUD_ACCOUNT_URL?.trim() || null;
}
