import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { securityEvents, user } from "@/lib/db/schema";
import {
  sendSecurityAlertEmail,
  type SecurityAlertKind,
} from "@/lib/email/security-alert";
import { logger } from "@/lib/logger";
import { notifyMany } from "@/lib/notifications";
import { runningVersion } from "@/lib/ops/version";

import {
  fetchSecurityStatusFeed,
  securityStatusFeedUrl,
  selectSecurityStatus,
} from "./status-feed";

const AUDIT_EVENTS = [
  "dependency_audit_passed",
  "dependency_audit_failed",
] as const;
const STALE_EVENT = "dependency_audit_stale";
const REQUEST_EVENT = "dependency_audit_requested";
const STALE_AFTER_MS = 36 * 60 * 60 * 1000;
const RUNNING_FOR_MS = 15 * 60 * 1000;

export type DependencySecurityStatus = {
  state: "healthy" | "failed" | "stale" | "awaiting" | "running";
  checkedAt: Date | null;
};

async function latestAuditEvent() {
  const [latest] = await db
    .select({
      event: securityEvents.event,
      createdAt: securityEvents.createdAt,
    })
    .from(securityEvents)
    .where(inArray(securityEvents.event, [...AUDIT_EVENTS]))
    .orderBy(desc(securityEvents.createdAt))
    .limit(1);
  return latest ?? null;
}

export async function getDependencySecurityStatus(
  now = new Date()
): Promise<DependencySecurityStatus> {
  const [latest, [request]] = await Promise.all([
    latestAuditEvent(),
    db
      .select({ createdAt: securityEvents.createdAt })
      .from(securityEvents)
      .where(eq(securityEvents.event, REQUEST_EVENT))
      .orderBy(desc(securityEvents.createdAt))
      .limit(1),
  ]);
  if (
    request &&
    (!latest || request.createdAt.getTime() > latest.createdAt.getTime()) &&
    now.getTime() - request.createdAt.getTime() <= RUNNING_FOR_MS
  ) {
    return { state: "running", checkedAt: request.createdAt };
  }
  if (!latest) return { state: "awaiting", checkedAt: null };
  if (latest.event === "dependency_audit_failed") {
    return { state: "failed", checkedAt: latest.createdAt };
  }
  if (now.getTime() - latest.createdAt.getTime() > STALE_AFTER_MS) {
    return { state: "stale", checkedAt: latest.createdAt };
  }
  return { state: "healthy", checkedAt: latest.createdAt };
}

export async function recordDependencyAuditRequested(actorId: string) {
  await db.insert(securityEvents).values({
    actorId,
    event: REQUEST_EVENT,
    method: "dashboard",
  });
}

async function activeSuperAdmins() {
  return db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(
      and(
        eq(user.role, "super_admin"),
        eq(user.isActive, true),
        eq(user.isBot, false)
      )
    );
}

export async function alertSuperAdmins(kind: SecurityAlertKind) {
  const recipients = await activeSuperAdmins();
  if (!recipients.length) {
    logger.error("security alert has no active super-admin recipient");
    return;
  }

  const databaseTls = kind === "database_tls";
  const results = await Promise.allSettled([
    notifyMany(recipients.map((recipient) => recipient.id), {
      type:
        databaseTls
          ? "security_database_transport_insecure"
          : kind === "failed"
          ? "security_dependency_audit_failed"
          : "security_dependency_audit_stale",
      title:
        databaseTls
          ? "Database connection is not encrypted"
          : kind === "failed"
          ? "Dependency security check failed"
          : "Dependency security check overdue",
      body:
        databaseTls
          ? "Enable PostgreSQL SSL in Coolify and use a verify-full connection."
          : kind === "failed"
          ? "Review the GitHub dependency audit and apply the security update."
          : "Check the scheduled GitHub Action and Sastra webhook.",
      link: "/settings/security",
      email: false,
    }),
    ...recipients.map((recipient) =>
      sendSecurityAlertEmail({ to: recipient.email, kind })
    ),
  ]);
  if (results.some((result) => result.status === "rejected")) {
    logger.error("one or more super-admin security alert deliveries failed");
  }
}

export async function recordDependencyAudit(input: {
  status: "passed" | "failed";
  checkedAt: Date;
  /** Where the result came from; shown nowhere, kept for the audit trail. */
  method?: "github_actions" | "status_feed";
}) {
  const event =
    input.status === "passed"
      ? "dependency_audit_passed"
      : "dependency_audit_failed";
  const shouldAlert = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('dependency-security-audit'))`
    );
    const [duplicate] = await tx
      .select({ id: securityEvents.id })
      .from(securityEvents)
      .where(
        and(
          eq(securityEvents.event, event),
          eq(securityEvents.createdAt, input.checkedAt)
        )
      )
      .limit(1);
    if (duplicate) return false;

    const [previous] = await tx
      .select({
        event: securityEvents.event,
        createdAt: securityEvents.createdAt,
      })
      .from(securityEvents)
      .where(inArray(securityEvents.event, [...AUDIT_EVENTS]))
      .orderBy(desc(securityEvents.createdAt))
      .limit(1);
    if (
      previous &&
      previous.createdAt.getTime() >= input.checkedAt.getTime()
    ) {
      return false;
    }
    await tx.insert(securityEvents).values({
      event,
      method: input.method ?? "github_actions",
      createdAt: input.checkedAt,
    });
    return event === "dependency_audit_failed" &&
      previous?.event !== "dependency_audit_failed";
  });

  if (shouldAlert) await alertSuperAdmins("failed");
}

export type FeedSyncResult =
  | { synced: true; status: "passed" | "failed"; ref: string }
  | { synced: false; reason: "disabled" | "unreachable" | "no-entry" };

/**
 * Pull the published audit result for the running version and record it as
 * if the workflow had reported it. Idempotent: an already-recorded or older
 * result is ignored by recordDependencyAudit.
 */
export async function syncDependencyAuditFromFeed(): Promise<FeedSyncResult> {
  const url = securityStatusFeedUrl();
  if (!url) return { synced: false, reason: "disabled" };
  let feed;
  try {
    feed = await fetchSecurityStatusFeed({ url });
  } catch {
    feed = null;
  }
  if (!feed) return { synced: false, reason: "unreachable" };
  const selected = selectSecurityStatus(feed, runningVersion());
  if (!selected) return { synced: false, reason: "no-entry" };
  await recordDependencyAudit({
    status: selected.status,
    checkedAt: selected.checkedAt,
    method: "status_feed",
  });
  return { synced: true, status: selected.status, ref: selected.ref };
}

export async function checkDependencyAuditFreshness(now = new Date()) {
  const status = await getDependencySecurityStatus(now);
  if (status.state !== "stale" && status.state !== "awaiting") {
    return { alerted: false, state: status.state };
  }

  const inserted = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('dependency-security-stale'))`
    );
    const [currentAudit] = await tx
      .select({
        event: securityEvents.event,
        createdAt: securityEvents.createdAt,
      })
      .from(securityEvents)
      .where(inArray(securityEvents.event, [...AUDIT_EVENTS]))
      .orderBy(desc(securityEvents.createdAt))
      .limit(1);
    if (
      currentAudit?.event === "dependency_audit_failed" ||
      (currentAudit &&
        now.getTime() - currentAudit.createdAt.getTime() <= STALE_AFTER_MS)
    ) {
      return false;
    }
    const [lastStale] = await tx
      .select({ createdAt: securityEvents.createdAt })
      .from(securityEvents)
      .where(eq(securityEvents.event, STALE_EVENT))
      .orderBy(desc(securityEvents.createdAt))
      .limit(1);
    if (
      lastStale &&
      (!currentAudit ||
        lastStale.createdAt.getTime() > currentAudit.createdAt.getTime())
    ) {
      return false;
    }
    await tx.insert(securityEvents).values({
      event: STALE_EVENT,
      method: "cron",
      createdAt: now,
    });
    return true;
  });

  if (inserted) await alertSuperAdmins("stale");
  return { alerted: inserted, state: status.state };
}
