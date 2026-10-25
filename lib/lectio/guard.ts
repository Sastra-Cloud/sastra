import "server-only";
import { eq } from "drizzle-orm";
import { lectioConnections, workspaceSettings } from "@/lib/db/schema";
import { moduleEnabled } from "@/lib/workspace/modules";
import type { IntegrationTransaction } from "./endpoint";
import { IntegrationError } from "./protocol/contract";
import { assertLectioCloudEligibility } from "./cloud-eligibility";

/** Global lock order: module consent, connection, project link, task queues, tasks. */
export async function lockActiveConnection(tx: IntegrationTransaction, id: string, allowPaused = false) {
  await assertLectioCloudEligibility();
  const [workspace] = await tx.select({ enabledModules: workspaceSettings.enabledModules }).from(workspaceSettings).where(eq(workspaceSettings.id, "workspace")).for("share");
  if (!workspace || !moduleEnabled(workspace.enabledModules, "lectio")) throw new IntegrationError("module_disabled", "The Lectio module is disabled.", 403);
  const [con] = await tx.select().from(lectioConnections).where(eq(lectioConnections.id, id)).for("update");
  if (!con || !(con.state === "active" || allowPaused && con.state === "paused")) throw new IntegrationError("connection_inactive", "Resume this Lectio connection first.", 409);
  return con;
}
