import Link from "next/link";
import { ne } from "drizzle-orm";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { lectioConnections, lectioSsoClients, user } from "@/lib/db/schema";
import { getWorkspaceSettings } from "@/lib/workspace/queries";
import { LECTIO_CLOUD_REQUIREMENT, moduleEnabled } from "@/lib/workspace/modules";
import { ConnectionSettings } from "@/components/lectio/connection-settings";
import { assertLectioCloudEligibility } from "@/lib/lectio/cloud-eligibility";
import { SharedSignInSetup } from "@/components/lectio/shared-sign-in";
import { integrationOrigin } from "@/lib/lectio/protocol/transport";
export const metadata = { title: "Lectio integration" };
export default async function LectioSettingsPage() {
  await requireRole("admin");
  try { await assertLectioCloudEligibility(); }
  catch { return <div className="space-y-3"><h2 className="text-2xl font-semibold">Lectio integration</h2>
    <p className="max-w-2xl text-sm text-muted-foreground">{LECTIO_CLOUD_REQUIREMENT}</p></div>; }
  if (!moduleEnabled((await getWorkspaceSettings()).enabledModules, "lectio")) return <div className="space-y-3">
    <h2 className="text-2xl font-semibold">Lectio integration</h2><p>Enable Lectio in <Link href="/settings/modules" className="text-primary underline">Modules</Link> to connect your translation teams.</p></div>;
  // Never serialize sealed credentials into a client component.
  const rows = await db.select({ id: lectioConnections.id, origin: lectioConnections.origin, teamName: lectioConnections.teamName,
    state: lectioConnections.state, profile: lectioConnections.profile, pairedBy: lectioConnections.pairedBy, lastSuccessAt: lectioConnections.lastSuccessAt }).from(lectioConnections).where(ne(lectioConnections.state, "revoked"));
  const people = await db.select({ id: user.id, name: user.name, active: user.isActive, role: user.role }).from(user);
  const sso = await db.select({ id: lectioSsoClients.connectionId, enabled: lectioSsoClients.enabled }).from(lectioSsoClients);
  let lectioOrigin: string | null = null;
  const target = process.env.LECTIO_APP_ORIGIN?.trim() || rows[0]?.origin;
  if (target) {
    try { lectioOrigin = integrationOrigin(target); }
    catch { /* An invalid operator setting must not become a client redirect. */ }
  }
  return <div className="space-y-6"><header className="space-y-1"><h2 className="text-2xl font-semibold">Lectio integration</h2>
    <p className="max-w-2xl text-sm text-muted-foreground">Translate and review in Lectio. Plan schedules and coordinate the full publishing project in Sastra.</p></header>
    <ConnectionSettings lectioOrigin={lectioOrigin} connections={rows.map(({ profile, pairedBy, ...row }) => {
      const approver = people.find(person => person.id === ((profile.connectionApproval as { actorId?: string } | undefined)?.actorId ?? pairedBy));
      return { ...row, approvedBy: approver?.active && ["admin", "super_admin"].includes(approver.role) ? approver.name : null, lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null };
    })} />
    {rows.filter(r => r.state === "active").map(row => <SharedSignInSetup key={row.id} connectionId={row.id} enabled={sso.find(c => c.id === row.id)?.enabled ?? false} />)}</div>;
}
