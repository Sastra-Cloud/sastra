import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { lectioConnections, lectioPairingIntents, user } from "@/lib/db/schema";
import { isAdminRole } from "@/lib/auth/policy";
import { openSecret } from "@/lib/crypto/secret-box";
import { requireWorkspaceModule } from "@/lib/workspace/module-guard";
import { assertLectioCloudEligibility } from "./cloud-eligibility";
import { IntegrationError, identifier } from "./protocol/contract";
import { digest } from "./protocol/signing";
import { integrationOrigin } from "./protocol/transport";

/** Public capability lookup for Lectio's backchannel; the verifier never leaves Sastra. */
export async function pairingProof(state: string) {
  const instanceId = await assertLectioCloudEligibility();
  const settings = await requireWorkspaceModule("lectio");
  const denied = () => new IntegrationError("invalid_pairing", "Restart connection setup in Sastra.", 403);
  const [intent] = await db.select().from(lectioPairingIntents).where(eq(lectioPairingIntents.id, identifier(state)));
  if (!intent || intent.expiresAt <= new Date() || intent.completedAt) throw denied();
  const [actor] = await db.select({ role: user.role, isActive: user.isActive }).from(user).where(eq(user.id, intent.userId));
  if (!actor?.isActive || !isAdminRole(actor)) throw denied();
  if (intent.connectionId) {
    const [connection] = await db.select({ state: lectioConnections.state }).from(lectioConnections).where(eq(lectioConnections.id, intent.connectionId));
    if (!connection || !["pending", "active"].includes(connection.state)) throw denied();
  }
  return { state: intent.id, challenge: digest(openSecret(intent.verifier)), instanceId,
    origin: integrationOrigin(process.env.BETTER_AUTH_URL || "http://localhost:3243"),
    lectioOrigin: intent.origin, workspaceName: settings.orgName || "Sastra workspace", expiresAt: intent.expiresAt.toISOString() };
}
