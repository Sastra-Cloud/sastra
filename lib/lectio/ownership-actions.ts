"use server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { activityLog, lectioConnections, user, workspaceSettings } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/guards";
import { moduleEnabled } from "@/lib/workspace/modules";
import { assertLectioCloudEligibility } from "./cloud-eligibility";
import { IntegrationError, identifier } from "./protocol/contract";
import { auditLectio } from "./audit";

export async function reapproveLectioConnection(connectionId: string) {
  const { user } = await requireRole("admin");
  try {
    identifier(connectionId); await assertLectioCloudEligibility();
    await db.transaction(async tx => {
      const [settings] = await tx.select().from(workspaceSettings).where(eq(workspaceSettings.id, "workspace")).for("share");
      if (!settings || !moduleEnabled(settings.enabledModules, "lectio")) throw new IntegrationError("module_disabled", "Enable Lectio in Modules first.", 403);
      const [con] = await tx.select().from(lectioConnections).where(and(eq(lectioConnections.id, connectionId), inArray(lectioConnections.state, ["active", "paused"]))).for("update");
      if (!con) throw new IntegrationError("connection_changed", "Reload the connection before reviewing approval.", 409);
      const previous = con.profile.connectionApproval ?? null;
      const approval = { actorId: user.id, at: new Date().toISOString() };
      await tx.update(lectioConnections).set({ profile: { ...con.profile, connectionApproval: approval } }).where(eq(lectioConnections.id, con.id));
      await auditLectio(tx, con.id, user.id, "connection_reapproved", { previous, approval });
    });
    revalidatePath("/settings/lectio"); return { saved: true };
  } catch (error) { return { error: error instanceof IntegrationError ? error.message : "Could not approve the connection. Try again." }; }
}

export async function listLectioAudit(connectionId: string) {
  await requireRole("admin"); identifier(connectionId);
  const events = await db.select({ id: activityLog.id, action: activityLog.action, actorId: activityLog.actorId, actorName: user.name, createdAt: activityLog.createdAt, data: activityLog.data })
    .from(activityLog).leftJoin(user, eq(user.id, activityLog.actorId)).where(and(eq(activityLog.entityType, "lectio_connection"), eq(activityLog.entityId, connectionId))).orderBy(desc(activityLog.createdAt)).limit(30);
  return events.map(event => ({ ...event, createdAt: event.createdAt.toISOString() }));
}
