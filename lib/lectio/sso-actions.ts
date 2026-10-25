"use server";
import { randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { lectioSsoClients, lectioSsoSessions, session } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/guards";
import { sealSecret, openSecret } from "@/lib/crypto/secret-box";
import { lockActiveConnection } from "./guard";
import { lectioRequest } from "./client";
import { auditLectio } from "./audit";

export async function configureLectioSharedSignIn(connectionId: string, enabled: boolean) {
  const { user } = await requireRole("admin");
  try {
    const { connection, client, revision } = await db.transaction(async tx => {
      const connection = await lockActiveConnection(tx, connectionId);
      let [client] = await tx.select().from(lectioSsoClients).where(eq(lectioSsoClients.connectionId, connectionId));
      if (!client) [client] = await tx.insert(lectioSsoClients).values({ connectionId, issuer: `${connection.origin}/api/auth`, clientId: `sastra-${connectionId}`, secret: sealSecret(randomBytes(32).toString("base64url")) }).returning();
      const revision = new Date(Math.max(Date.now(), client.updatedAt.getTime() + 1));
      await tx.update(lectioSsoClients).set({ updatedAt: revision }).where(eq(lectioSsoClients.connectionId, connectionId));
      // Disable locally before the remote call; a provider outage must not keep access open.
      if (!enabled) {
        await tx.update(lectioSsoClients).set({ enabled: false, updatedAt: revision }).where(eq(lectioSsoClients.connectionId, connectionId));
        const sessions = await tx.select().from(lectioSsoSessions).where(eq(lectioSsoSessions.connectionId, connectionId));
        for (const row of sessions) await tx.delete(session).where(eq(session.id, row.sessionId));
        await auditLectio(tx, connectionId, user.id, "shared_sign_in_disabled", { previous: client.enabled, next: false });
      }
      return { connection, client, revision };
    });
    const registered = await lectioRequest<{ issuer: string; clientId: string }>(connection, "/api/integrations/sastra/sso/register", { secret: openSecret(client.secret), enabled }, `sso-register-${randomUUID()}`);
    if (registered.issuer !== client.issuer || registered.clientId !== client.clientId) throw new Error("The identity provider configuration did not match this connection.");
    await db.transaction(async tx => { await lockActiveConnection(tx, connectionId);
      const [current] = await tx.select().from(lectioSsoClients).where(eq(lectioSsoClients.connectionId, connectionId));
      if (current.updatedAt.getTime() !== revision.getTime()) throw new Error("Shared sign-in settings changed during this request.");
      await tx.update(lectioSsoClients).set({ enabled, updatedAt: new Date() }).where(eq(lectioSsoClients.connectionId, connectionId));
      if (enabled) await auditLectio(tx, connectionId, user.id, "shared_sign_in_enabled", { previous: current.enabled, next: true }); });
    revalidatePath("/settings/lectio"); revalidatePath("/settings/profile");
    return { saved: true };
  } catch { return { error: enabled ? "Shared sign-in could not be enabled. Check the connection and try again." : "Sign-in was disabled locally; retry to confirm it in Lectio." }; }
}
