import "server-only";

import { desc, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { securityEvents } from "@/lib/db/schema";
import { alertSuperAdmins } from "@/lib/security/dependency-monitor";
import { databaseTransportIsSecure } from "@/lib/security/database-transport-rules";

const INSECURE_EVENT = "database_transport_insecure";
const SECURE_EVENT = "database_transport_secure";

export type DatabaseTransportSecurityStatus = {
  state: "secure" | "insecure" | "development";
  checkedAt: Date;
};

export async function getDatabaseTransportSecurityStatus(): Promise<DatabaseTransportSecurityStatus> {
  if (process.env.NODE_ENV !== "production") {
    return { state: "development", checkedAt: new Date() };
  }
  const rows = await db.execute(
    sql<{ tls: boolean }>`
      select coalesce(
        (select ssl from pg_stat_ssl where pid = pg_backend_pid()),
        false
      ) as tls
    `
  );
  const secure = databaseTransportIsSecure({
    serverReportsTls: rows[0]?.tls === true,
    connectionString: process.env.DATABASE_URL,
  });
  return {
    state: secure ? "secure" : "insecure",
    checkedAt: new Date(),
  };
}

export async function checkDatabaseTransportSecurity() {
  const status = await getDatabaseTransportSecurityStatus();
  if (status.state === "development") {
    return { ...status, alerted: false };
  }

  const shouldAlert = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('database-transport-security'))`
    );
    const [latest] = await tx
      .select({ event: securityEvents.event })
      .from(securityEvents)
      .where(
        inArray(securityEvents.event, [INSECURE_EVENT, SECURE_EVENT])
      )
      .orderBy(desc(securityEvents.createdAt))
      .limit(1);

    const event =
      status.state === "secure" ? SECURE_EVENT : INSECURE_EVENT;
    if (latest?.event === event) return false;
    await tx.insert(securityEvents).values({
      event,
      method: "cron",
      createdAt: status.checkedAt,
    });
    return status.state === "insecure";
  });

  if (shouldAlert) await alertSuperAdmins("database_tls");
  return { ...status, alerted: shouldAlert };
}
