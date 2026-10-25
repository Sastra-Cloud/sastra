import "server-only";
import { and, eq } from "drizzle-orm";
import { lectioSsoIdentities } from "@/lib/db/schema";
import type { IntegrationTransaction } from "./endpoint";
import { IntegrationError } from "./protocol/contract";

/** Administrative assignment matching alone never delegates a person's authority. */
export async function assertVerifiedLectioActor(tx: IntegrationTransaction, origin: string, userId: string, subject: string) {
  const [identity] = await tx.select({ id: lectioSsoIdentities.id }).from(lectioSsoIdentities).where(and(
    eq(lectioSsoIdentities.issuer, `${origin}/api/auth`), eq(lectioSsoIdentities.userId, userId), eq(lectioSsoIdentities.subject, subject),
  )).for("share");
  if (!identity) throw new IntegrationError("identity_required", "Link your existing accounts in Profile settings before managing work across apps.", 403);
}
