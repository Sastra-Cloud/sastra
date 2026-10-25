import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { lectioConnections, lectioSsoIdentities, lectioSsoSessions, session } from "@/lib/db/schema";
import { activityLog } from "@/lib/db/schema";
import { auditLectio } from "./audit";
export async function unlinkSsoIdentity(userId: string) {
  await db.transaction(async tx => {
    const identities = await tx.select().from(lectioSsoIdentities).where(eq(lectioSsoIdentities.userId, userId)).for("update");
    if (!identities.length) return;
    const sessions = await tx.select().from(lectioSsoSessions).where(inArray(lectioSsoSessions.identityId, identities.map(i => i.id)));
    if (sessions.length) await tx.delete(session).where(inArray(session.id, sessions.map(s => s.sessionId)));
    await tx.delete(lectioSsoIdentities).where(eq(lectioSsoIdentities.userId, userId));
    await tx.insert(activityLog).values({ actorId: userId, entityType: "lectio_identity", entityId: userId,
      action: "lectio_identity_unlinked", summary: "Unlinked Lectio shared sign-in and revoked its sessions", data: { identities: identities.map(identity => ({ id: identity.id, issuer: identity.issuer, subject: identity.subject })) } });
    const connections = await tx.select().from(lectioConnections).where(inArray(lectioConnections.origin, [...new Set(identities.map(identity => new URL(identity.issuer).origin))]));
    for (const connection of connections) await auditLectio(tx, connection.id, userId, "identity_unlinked", { identityIds: identities.filter(identity => new URL(identity.issuer).origin === connection.origin).map(identity => identity.id) });
  });
}
