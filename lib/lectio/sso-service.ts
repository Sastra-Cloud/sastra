import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { activityLog, lectioConnections, lectioSsoClients, lectioSsoIdentities, lectioUserLinks, user } from "@/lib/db/schema";
import { lockActiveConnection } from "./guard";
import { assertLectioCloudEligibility } from "./cloud-eligibility";
import { lectioRequest } from "./client";
import { IntegrationError } from "./protocol/contract";

export async function activeSsoClient(connectionId: string) {
  await assertLectioCloudEligibility();
  return db.transaction(async tx => {
    const connection = await lockActiveConnection(tx, connectionId);
    const [client] = await tx.select().from(lectioSsoClients).where(eq(lectioSsoClients.connectionId, connectionId));
    if (!client?.enabled || client.issuer !== `${connection.origin}/api/auth`) throw new IntegrationError("sso_disabled", "Shared sign-in is disabled. Use your usual Sastra sign-in.", 403);
    return { client, connection };
  });
}
export async function checkSsoMembership(connectionId: string, subject: string) {
  const current = await activeSsoClient(connectionId);
  const membership = await lectioRequest<{ active: boolean; teamId: string; person?: { id: string; name: string | null; email: string } }>(current.connection, "/api/integrations/sastra/sso/member", { subject }, `sso-member-${randomUUID()}`);
  if (!membership.active || membership.teamId !== current.connection.teamId) throw new IntegrationError("not_team_member", "Current Lectio team membership is required.", 403);
  return { ...current, membership };
}

/** Exact issuer/sub binding only. Email and manual progress matches cannot authenticate. */
export async function resolveSsoIdentity(input: { connectionId: string; issuer: string; subject: string; linkUserId?: string }) {
  await checkSsoMembership(input.connectionId, input.subject);
  return db.transaction(async tx => {
    const con = await lockActiveConnection(tx, input.connectionId);
    if (`${con.origin}/api/auth` !== input.issuer) throw new IntegrationError("identity_changed", "Identity provider changed. Restart account linking.", 409);
    let [identity] = await tx.select().from(lectioSsoIdentities).where(and(eq(lectioSsoIdentities.issuer, input.issuer), eq(lectioSsoIdentities.subject, input.subject)));
    if (identity && input.linkUserId && identity.userId !== input.linkUserId) throw new IntegrationError("identity_conflict", "This Lectio account is already linked to another Sastra account.", 409);
    if (!identity && !input.linkUserId) throw new IntegrationError("identity_required", "Sign in with your usual Sastra account, then link Lectio in Profile settings.", 403);
    const [local] = await tx.select().from(user).where(eq(user.id, identity?.userId ?? input.linkUserId!)).for("update");
    if (!local?.isActive || local.isBot) throw new IntegrationError("identity_required", "An active Sastra account is required.", 403);
    const [localIdentity] = await tx.select().from(lectioSsoIdentities).where(and(eq(lectioSsoIdentities.issuer, input.issuer), eq(lectioSsoIdentities.userId, local.id)));
    if (localIdentity && localIdentity.subject !== input.subject) throw new IntegrationError("identity_conflict", "Your Sastra account already has a different Lectio sign-in link. Unlink it from Profile first.", 409);
    if (!identity) {
      [identity] = await tx.insert(lectioSsoIdentities).values({ userId: local.id, issuer: input.issuer, subject: input.subject }).returning();
      await tx.insert(activityLog).values({ actorId: local.id, entityType: "lectio_connection", entityId: con.id,
        action: "lectio_identity_linked", summary: "Linked existing Sastra and Lectio sign-in accounts",
        data: { identityId: identity.id, issuer: input.issuer, subject: input.subject, userId: local.id } });
    }
    const [byLocal] = await tx.select().from(lectioUserLinks).where(and(eq(lectioUserLinks.connectionId, con.id), eq(lectioUserLinks.userId, local.id)));
    const [byRemote] = await tx.select().from(lectioUserLinks).where(and(eq(lectioUserLinks.connectionId, con.id), eq(lectioUserLinks.remoteUserId, input.subject)));
    if ((byLocal && byLocal.remoteUserId !== input.subject) || (byRemote && byRemote.userId !== local.id)) throw new IntegrationError("identity_conflict", "An administrator must correct the existing person match before linking sign-in.", 409);
    if (!byLocal) await tx.insert(lectioUserLinks).values({ connectionId: con.id, userId: local.id, remoteUserId: input.subject, remoteName: local.name, confirmedBy: local.id });
    return { identity, user: local };
  });
}

export async function ssoChoices() {
  try {
    await assertLectioCloudEligibility();
    const rows = await db.select({ id: lectioConnections.id, name: lectioConnections.teamName }).from(lectioConnections)
      .innerJoin(lectioSsoClients, eq(lectioConnections.id, lectioSsoClients.connectionId))
      .where(and(eq(lectioConnections.state, "active"), eq(lectioSsoClients.enabled, true)));
    // Also enforce module consent, not just the UI visibility of integration settings.
    for (const row of rows) await activeSsoClient(row.id);
    return rows;
  } catch { return []; }
}
