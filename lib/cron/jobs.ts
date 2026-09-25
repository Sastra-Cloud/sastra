import "server-only";

import { and, eq, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { after } from "next/server";

import { runAgreementIndex } from "@/lib/agreement-chat/indexing";
import { reevaluateSharedMouPayments } from "@/lib/agreements/readiness-engine";
import { runAssistantReflection } from "@/lib/assistant/reflection";
import { recomputeAllBlockers } from "@/lib/blockers/engine";
import { writeProjectSnapshots } from "@/lib/blockers/snapshots";
import { ensureRoyaltyReminderTasksForAllProjects } from "@/lib/budget/actions";
import { generateDueRoyaltyPayments } from "@/lib/budget/royalty-recurring";
import { db } from "@/lib/db";
import {
  agreementDocumentChunks,
  agreementDocuments,
  donationImports,
  files,
  notificationEmailQueue,
  securityEvents,
  standupRuns,
  standups,
  user,
  wikiMedia,
  wikiPages,
  wikiSearchChunks,
} from "@/lib/db/schema";
import { getAgendaItems, agendaToday } from "@/lib/agenda/queries";
import { bucketAgenda } from "@/lib/agenda/bucket";
import {
  backfillExternalFollowUps,
  notifyDueExternalFollowUps,
  refreshFollowUpSummary,
} from "@/lib/email/follow-ups";
import { runEmailSignalReflection } from "@/lib/email/signal-reflection";
import { reflectEmailTaskFeedback } from "@/lib/email/task-reflection";
import {
  gmailEnabled,
  runCaptureSync,
  syncRecentPrintProofAttachments,
} from "@/lib/gmail";
import { notify } from "@/lib/notifications";
import { processNotificationEmailQueue } from "@/lib/notifications/email-queue";
import { notifyOverdueAssignees } from "@/lib/notifications/overdue";
import { reviewNewProjectUpdates } from "@/lib/projects/update-review";
import {
  buildWikiVideoCaptionKey,
  buildWikiVideoPosterKey,
  deleteObject,
} from "@/lib/r2";
import { ensureLicenseFeePayments } from "@/lib/rights/license-fee-recurring";
import { ensureLicenseRenewalReminders } from "@/lib/rights/renewal-recurring";
import { checkDatabaseTransportSecurity } from "@/lib/security/database-transport";
import {
  checkDependencyAuditFreshness,
  syncDependencyAuditFromFeed,
} from "@/lib/security/dependency-monitor";
import { markMissedRuns, startDueStandups } from "@/lib/standup/engine";
import { generateDueReports } from "@/lib/standup/insights";
import { generateDueRecurringTasks } from "@/lib/tasks/recurring";
import { runWikiSearchIndex } from "@/lib/wiki/search-index";
import type { WorkspaceSettings } from "@/lib/workspace/queries";

import { recordCronRun } from "./runs";
import {
  addMs,
  dailyDue,
  DAY_MS,
  earliest,
  HOUR_MS,
  intervalDue,
  isInWeeklyWindow,
  MINUTE_MS,
  nextLocalOccurrence,
  nextWeeklyWindow,
  pollingDue,
  sameLocalHour,
  type WorkSchedule,
} from "./schedule";
import type { CronJob, CronJobContext } from "./tick";

export type ScheduledJobContext = CronJobContext & {
  workspace: WorkspaceSettings;
};

export type ScheduledJob = CronJob<ScheduledJobContext>;

export const CRON_JOB_NAMES = [
  "notification-emails",
  "standup",
  "gmail-poll",
  "weekly-digest",
  "wiki-search-index",
  "agreement-index",
  "recompute-blockers",
  "donation-upload-cleanup",
  "wiki-media-cleanup",
  "security-monitor",
  "assistant-reflection",
] as const;

export type CronJobName = (typeof CRON_JOB_NAMES)[number];

export function isCronJobName(value: string): value is CronJobName {
  return (CRON_JOB_NAMES as readonly string[]).includes(value);
}

function workSchedule(workspace: WorkspaceSettings): WorkSchedule {
  return {
    timezone: workspace.timezone,
    workDays: workspace.workDays,
    workHoursStart: workspace.workHoursStart,
    workHoursEnd: workspace.workHoursEnd,
  };
}

const STALE_PROCESSING_MS = 15 * MINUTE_MS;

/** Send due notification email; due whenever a queue row is waiting. */
const notificationEmails: ScheduledJob = {
  name: "notification-emails",
  async nextDue({ now }) {
    const [pending] = await db
      .select({ deliverAt: sql<Date | null>`min(${notificationEmailQueue.deliverAt})` })
      .from(notificationEmailQueue)
      .where(eq(notificationEmailQueue.state, "pending"));
    const [stuck] = await db
      .select({ claimedAt: sql<Date | null>`min(${notificationEmailQueue.claimedAt})` })
      .from(notificationEmailQueue)
      .where(eq(notificationEmailQueue.state, "processing"));
    const retryAt = stuck?.claimedAt ? addMs(new Date(stuck.claimedAt), STALE_PROCESSING_MS) : null;
    const dueAt = pending?.deliverAt ? new Date(pending.deliverAt) : null;
    const next = earliest(dueAt, retryAt);
    return next && next.getTime() < now.getTime() ? now : next;
  },
  async run() {
    const report = await processNotificationEmailQueue();
    return {
      ok: report.failures === 0,
      note: [
        `${report.batches} batches`,
        `${report.sentItems} items sent`,
        `${report.suppressedItems} suppressed`,
        `${report.retries} retries`,
        `${report.failures} failed`,
      ].join(" · "),
      result: { ...report },
    };
  },
};

/**
 * Standups: due at the next scheduled start, every 15 minutes while a run is
 * open (questions in progress, reports pending), and shortly after each local
 * midnight so missed runs get marked.
 */
const standup: ScheduledJob = {
  name: "standup",
  async nextDue({ now, lastRunAt }) {
    const active = await db
      .select({
        scheduleTime: standups.scheduleTime,
        scheduleDays: standups.scheduleDays,
        timezone: standups.timezone,
      })
      .from(standups)
      .where(eq(standups.isActive, true));
    if (active.length === 0) return null;
    const [open] = await db
      .select({ id: standupRuns.id })
      .from(standupRuns)
      .where(inArray(standupRuns.status, ["pending", "in_progress"]))
      .limit(1);
    if (open) return intervalDue(now, lastRunAt, 15 * MINUTE_MS);
    let next: Date | null = null;
    for (const s of active) {
      next = earliest(
        next,
        nextLocalOccurrence(now, s.timezone, s.scheduleTime, s.scheduleDays),
        nextLocalOccurrence(now, s.timezone, "00:05")
      );
    }
    return next;
  },
  async run() {
    const started = await startDueStandups();
    const missed = await markMissedRuns();
    const reports = await generateDueReports();
    return {
      ok: true,
      note: `${started} started · ${missed} missed · ${reports} reports`,
      result: { started, missed, reports },
    };
  },
};

/** Poll the IMAP capture mailbox: every 5 minutes in work hours, hourly otherwise. */
const gmailPoll: ScheduledJob = {
  name: "gmail-poll",
  async nextDue({ now, lastRunAt, workspace }) {
    if (!gmailEnabled()) return null;
    return pollingDue(now, lastRunAt, workSchedule(workspace), 5 * MINUTE_MS, HOUR_MS);
  },
  async run() {
    if (!gmailEnabled()) {
      return { ok: true, note: "skipped: capture mailbox not configured", result: { skipped: "disabled" } };
    }
    const events = await runCaptureSync();
    // Routine arrivals stay in Correspondence. Specific extracted work still
    // creates its own task, review, or follow-up notification downstream.
    const notified = 0;
    const proofRepair = await syncRecentPrintProofAttachments();
    const backfilled = await backfillExternalFollowUps();
    const followUpReminders = await notifyDueExternalFollowUps();
    if (backfilled.length) {
      after(() => Promise.all(backfilled.slice(0, 10).map(refreshFollowUpSummary)));
    }
    return {
      ok: true,
      note: `${events.length} ingested · ${notified} notified · ${proofRepair.proofsStored} proofs stored · ${proofRepair.followUpsResolved} split-thread follow-ups resolved · ${backfilled.length} follow-ups backfilled · ${followUpReminders} reminders`,
      result: {
        ingested: events.length,
        notified,
        proofAttachmentsStored: proofRepair.proofsStored,
        splitThreadFollowUpsResolved: proofRepair.followUpsResolved,
        followUpsBackfilled: backfilled.length,
        followUpReminders,
      },
    };
  },
};

/**
 * Weekly deadline digest for managers, sent once inside the local weekday and
 * hour configured in Workspace Settings.
 */
const weeklyDigest: ScheduledJob = {
  name: "weekly-digest",
  async nextDue({ now, lastRunAt, workspace }) {
    const { timezone, weeklyDigestDay, weeklyDigestTime } = workspace;
    if (
      isInWeeklyWindow(now, timezone, weeklyDigestDay, weeklyDigestTime) &&
      !(lastRunAt && sameLocalHour(lastRunAt, now, timezone))
    ) {
      return now;
    }
    return nextWeeklyWindow(now, timezone, weeklyDigestDay, weeklyDigestTime);
  },
  async run({ now, lastRunAt, workspace }) {
    const { timezone, weeklyDigestDay, weeklyDigestTime } = workspace;
    if (!isInWeeklyWindow(now, timezone, weeklyDigestDay, weeklyDigestTime)) {
      return { ok: true, note: "skipped: outside digest window", result: { skipped: "outside configured digest window" } };
    }
    if (lastRunAt && sameLocalHour(lastRunAt, now, timezone)) {
      return { ok: true, note: "skipped: already sent this hour", result: { skipped: "already sent this hour" } };
    }
    const managers = await db
      .select({ id: user.id, role: user.role })
      .from(user)
      .where(
        and(
          inArray(user.role, ["manager", "admin", "super_admin"]),
          eq(user.isBot, false),
          eq(user.isActive, true)
        )
      );
    const today = agendaToday(now, timezone);
    let notified = 0;
    for (const m of managers) {
      const items = await getAgendaItems({ userId: m.id, role: m.role as string, horizonDays: 7 });
      const buckets = bucketAgenda(items, today);
      const overdueN = buckets.overdue.length;
      const weekN = buckets.thisWeek.length;
      if (overdueN === 0 && weekN === 0) continue;
      const parts: string[] = [];
      if (overdueN) parts.push(`${overdueN} overdue`);
      if (weekN) parts.push(`${weekN} due this week`);
      await notify({
        userId: m.id,
        type: "weekly_deadlines",
        title: "This week's deadlines",
        body: parts.join(" · "),
        link: "/tasks?view=agenda",
        data: { overdue: overdueN, thisWeek: weekN },
      });
      notified += 1;
    }
    return {
      ok: true,
      note: `${notified} managers notified`,
      result: { managers: managers.length, notified },
    };
  },
};

/** Wiki semantic index: every 5 minutes while chunks wait, hourly as a backstop. */
const wikiSearchIndex: ScheduledJob = {
  name: "wiki-search-index",
  async nextDue({ now, lastRunAt }) {
    const staleBefore = addMs(now, -STALE_PROCESSING_MS);
    const [waiting] = await db
      .select({ id: wikiSearchChunks.id })
      .from(wikiSearchChunks)
      .where(
        or(
          eq(wikiSearchChunks.embeddingStatus, "pending"),
          and(
            eq(wikiSearchChunks.embeddingStatus, "failed"),
            or(isNull(wikiSearchChunks.nextEmbeddingAttemptAt), lte(wikiSearchChunks.nextEmbeddingAttemptAt, now))
          ),
          and(eq(wikiSearchChunks.embeddingStatus, "processing"), lt(wikiSearchChunks.updatedAt, staleBefore))
        )
      )
      .limit(1);
    return intervalDue(now, lastRunAt, waiting ? 5 * MINUTE_MS : HOUR_MS);
  },
  async run() {
    const result = await runWikiSearchIndex();
    return {
      ok: true,
      note: `${result.rebuiltPages} pages rebuilt, ${result.embeddedChunks} chunks embedded`,
      result: { ...result },
    };
  },
};

/** Agreement (MoU/License) index: every 10 minutes while work waits, hourly otherwise. */
const agreementIndex: ScheduledJob = {
  name: "agreement-index",
  async nextDue({ now, lastRunAt }) {
    const staleBefore = addMs(now, -STALE_PROCESSING_MS);
    const [document] = await db
      .select({ id: agreementDocuments.id })
      .from(agreementDocuments)
      .where(
        or(
          eq(agreementDocuments.status, "pending"),
          and(
            eq(agreementDocuments.status, "failed"),
            or(isNull(agreementDocuments.nextAttemptAt), lte(agreementDocuments.nextAttemptAt, now))
          ),
          and(eq(agreementDocuments.status, "processing"), lt(agreementDocuments.processingStartedAt, staleBefore))
        )
      )
      .limit(1);
    const [chunk] = document
      ? [document]
      : await db
          .select({ id: agreementDocumentChunks.id })
          .from(agreementDocumentChunks)
          .where(
            or(
              eq(agreementDocumentChunks.embeddingStatus, "pending"),
              and(
                eq(agreementDocumentChunks.embeddingStatus, "failed"),
                or(
                  isNull(agreementDocumentChunks.nextEmbeddingAttemptAt),
                  lte(agreementDocumentChunks.nextEmbeddingAttemptAt, now)
                )
              )
            )
          )
          .limit(1);
    return intervalDue(now, lastRunAt, chunk ? 10 * MINUTE_MS : HOUR_MS);
  },
  async run() {
    const result = await runAgreementIndex();
    return {
      ok: true,
      note: `${result.upgraded} upgraded, ${result.discovered} discovered, ${result.parsed} parsed, ${result.embedded} chunks embedded`,
      result: { ...result },
    };
  },
};

/** Daily 06:00 sweep of time-based blockers, recurring work, and overdue notices. */
const recomputeBlockers: ScheduledJob = {
  name: "recompute-blockers",
  async nextDue({ now, lastRunAt, workspace }) {
    return dailyDue(now, lastRunAt, workspace.timezone, "06:00");
  },
  async run() {
    const projects = await recomputeAllBlockers();
    // Snapshot fresh health/progress/budget for trend lines (idempotent per day).
    const snapshots = await writeProjectSnapshots();
    const royaltyReminders = await ensureRoyaltyReminderTasksForAllProjects();
    const recurringTasks = await generateDueRecurringTasks();
    const royaltyPayments = await generateDueRoyaltyPayments();
    const licenseRenewals = await ensureLicenseRenewalReminders();
    const licenseFees = await ensureLicenseFeePayments();
    const overdueNotified = await notifyOverdueAssignees();
    const sharedMouInvoices = await reevaluateSharedMouPayments();
    return {
      ok: true,
      note: `${projects} projects · ${snapshots} snapshots · ${royaltyReminders} royalty reminders · ${recurringTasks} recurring · ${royaltyPayments} royalty payments · ${licenseRenewals} license renewals · ${licenseFees} license fees · ${sharedMouInvoices} shared MoU invoices`,
      result: {
        projects,
        snapshots,
        royaltyReminders,
        recurringTasks,
        royaltyPayments,
        licenseRenewals,
        licenseFees,
        sharedMouInvoices,
        overdueNotified,
      },
    };
  },
};

/** Nightly: remove abandoned donation uploads and purge retained source files. */
const donationUploadCleanup: ScheduledJob = {
  name: "donation-upload-cleanup",
  async nextDue({ now, lastRunAt, workspace }) {
    return dailyDue(now, lastRunAt, workspace.timezone, "03:10");
  },
  async run({ now }) {
    const oneDayAgo = addMs(now, -DAY_MS);
    const abandonedCandidates = await db
      .select({ id: files.id })
      .from(files)
      .leftJoin(donationImports, eq(donationImports.fileId, files.id))
      .where(
        and(
          eq(files.purpose, "donation_import"),
          lt(files.createdAt, oneDayAgo),
          isNull(donationImports.id),
          or(eq(files.status, "pending"), eq(files.status, "failed"), eq(files.status, "ready"))
        )
      )
      .limit(100);
    const expiredSourceCandidates = await db
      .select({ id: files.id })
      .from(donationImports)
      .innerJoin(files, eq(files.id, donationImports.fileId))
      .where(
        and(
          eq(files.purpose, "donation_import"),
          eq(donationImports.sourceLegalHold, false),
          isNull(donationImports.sourcePurgedAt),
          lt(donationImports.sourceRetentionUntil, now)
        )
      )
      .limit(100);

    let abandonedDeleted = 0;
    let sourceFilesPurged = 0;
    let failed = 0;
    for (const candidate of abandonedCandidates) {
      try {
        const removed = await db.transaction(async (tx) => {
          await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`donation-file:${candidate.id}`}))`);
          const [current] = await tx
            .select({ id: files.id, r2Key: files.r2Key, importId: donationImports.id })
            .from(files)
            .leftJoin(donationImports, eq(donationImports.fileId, files.id))
            .where(
              and(
                eq(files.id, candidate.id),
                eq(files.purpose, "donation_import"),
                or(eq(files.status, "pending"), eq(files.status, "failed"), eq(files.status, "ready"))
              )
            )
            .limit(1);
          if (!current || current.importId) return false;
          await deleteObject(current.r2Key);
          await tx.delete(files).where(eq(files.id, current.id));
          return true;
        });
        if (removed) abandonedDeleted += 1;
      } catch (error) {
        failed += 1;
        console.error("Donation upload cleanup failed:", candidate.id, error);
      }
    }

    for (const candidate of expiredSourceCandidates) {
      try {
        const purged = await db.transaction(async (tx) => {
          await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`donation-file:${candidate.id}`}))`);
          const [current] = await tx
            .select({ fileId: files.id, importId: donationImports.id, r2Key: files.r2Key })
            .from(donationImports)
            .innerJoin(files, eq(files.id, donationImports.fileId))
            .where(
              and(
                eq(files.id, candidate.id),
                eq(files.purpose, "donation_import"),
                eq(donationImports.sourceLegalHold, false),
                isNull(donationImports.sourcePurgedAt),
                lt(donationImports.sourceRetentionUntil, now)
              )
            )
            .limit(1);
          if (!current) return false;
          await deleteObject(current.r2Key);
          await tx
            .update(donationImports)
            .set({
              fileId: null,
              sourcePurgedAt: new Date(),
              sourcePurgeReason: "Workspace operational-copy retention period elapsed",
            })
            .where(eq(donationImports.id, current.importId));
          await tx.delete(files).where(eq(files.id, current.fileId));
          return true;
        });
        if (purged) sourceFilesPurged += 1;
      } catch (error) {
        failed += 1;
        console.error("Donation source purge failed:", candidate.id, error);
      }
    }

    if (abandonedDeleted > 0 || sourceFilesPurged > 0) {
      await db.insert(securityEvents).values({
        event: "donation_upload_cleanup",
        method: `${abandonedDeleted} abandoned · ${sourceFilesPurged} retained-source purged`,
      });
    }
    return {
      ok: failed === 0,
      note: `${abandonedDeleted} abandoned · ${sourceFilesPurged} source purged · ${failed} failed`,
      result: { abandonedDeleted, sourceFilesPurged, failed },
    };
  },
};

/** Nightly: delete failed/orphaned wiki media and hard-delete expired pages. */
const wikiMediaCleanup: ScheduledJob = {
  name: "wiki-media-cleanup",
  async nextDue({ now, lastRunAt, workspace }) {
    return dailyDue(now, lastRunAt, workspace.timezone, "03:20");
  },
  async run({ now }) {
    const oneDayAgo = addMs(now, -DAY_MS);
    const thirtyDaysAgo = addMs(now, -30 * DAY_MS);
    const candidates = await db
      .select()
      .from(wikiMedia)
      .where(
        or(
          and(or(eq(wikiMedia.status, "pending"), eq(wikiMedia.status, "failed")), lt(wikiMedia.createdAt, oneDayAgo)),
          and(isNotNull(wikiMedia.orphanedAt), lt(wikiMedia.orphanedAt, thirtyDaysAgo))
        )
      )
      .limit(100);

    let deleted = 0;
    let failed = 0;
    for (const media of candidates) {
      try {
        if (media.kind === "video" && media.r2Key) {
          await Promise.all([
            deleteObject(media.r2Key),
            deleteObject(buildWikiVideoPosterKey(media.id)).catch(() => undefined),
            deleteObject(buildWikiVideoCaptionKey(media.id)).catch(() => undefined),
          ]);
        } else if (media.kind === "image" && media.r2Key) {
          await deleteObject(media.r2Key);
        }
        await db.delete(wikiMedia).where(eq(wikiMedia.id, media.id));
        deleted += 1;
      } catch (error) {
        failed += 1;
        console.error("Wiki media cleanup failed:", media.id, error);
      }
    }
    const expiredPages = await db
      .select({ id: wikiPages.id })
      .from(wikiPages)
      .where(and(isNotNull(wikiPages.deletedAt), lt(wikiPages.deletedAt, thirtyDaysAgo)))
      .limit(100);
    let pagesDeleted = 0;
    for (const page of expiredPages) {
      const [remainingMedia] = await db
        .select({ id: wikiMedia.id })
        .from(wikiMedia)
        .where(eq(wikiMedia.pageId, page.id))
        .limit(1);
      if (remainingMedia) continue;
      await db.delete(wikiPages).where(eq(wikiPages.id, page.id));
      pagesDeleted += 1;
    }
    return {
      ok: failed === 0,
      note: `${deleted} media deleted · ${pagesDeleted} pages deleted · ${failed} failed`,
      result: { deleted, pagesDeleted, failed },
    };
  },
};

/** Daily security checks: dependency audit freshness and database TLS. */
const securityMonitor: ScheduledJob = {
  name: "security-monitor",
  async nextDue({ now, lastRunAt, workspace }) {
    return dailyDue(now, lastRunAt, workspace.timezone, "03:30");
  },
  async run() {
    // Published audit results first, so the freshness check sees them.
    const feed = await syncDependencyAuditFromFeed();
    const [dependency, database] = await Promise.all([
      checkDependencyAuditFreshness(),
      checkDatabaseTransportSecurity(),
    ]);
    const databaseOk = database.state === "secure" || database.state === "development";
    const ok = dependency.state === "healthy" && databaseOk;
    return {
      ok,
      note: `dependencies ${dependency.state} · database ${database.state}${
        dependency.alerted || database.alerted ? " · alerted" : ""
      }`,
      result: { dependency, database, feed },
    };
  },
};

/**
 * Daily AI maintenance pass: review-only assistant learning plus advisory
 * project-update follow-ups. Neither path can execute recommendations or
 * activate prompts, tools, permissions, or memory. Each pass records its own
 * `cron_runs` row so the Overview strip can show them separately.
 */
const assistantReflection: ScheduledJob = {
  name: "assistant-reflection",
  async nextDue({ now, lastRunAt, workspace }) {
    return dailyDue(now, lastRunAt, workspace.timezone, "04:00");
  },
  async run() {
    const errors: string[] = [];
    const result: Record<string, unknown> = {};

    let reflectionNote = "";
    try {
      const reflection = await runAssistantReflection();
      result.reflection = reflection;
      reflectionNote = `${reflection.evidenceCount} evidence · ${reflection.candidateCount} candidates`;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Reflection failed";
      errors.push(`Assistant reflection: ${message}`);
    }

    try {
      const emailTaskReflection = await reflectEmailTaskFeedback();
      result.emailTaskReflection = emailTaskReflection;
      await recordCronRun(
        "email-task-reflection",
        true,
        `${emailTaskReflection.evidenceCount} decisions · ${emailTaskReflection.candidateCount} candidates`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Email task reflection failed";
      await recordCronRun("email-task-reflection", false, message);
      errors.push(`Email task reflection: ${message}`);
    }

    // Learn from managers dismissing wrong intake suggestions. Guarded and caught
    // separately so it can never break the assistant reflection pass.
    try {
      const emailSignalReflection = await runEmailSignalReflection();
      result.emailSignalReflection = emailSignalReflection;
      await recordCronRun(
        "email-signal-reflection",
        true,
        `${emailSignalReflection.evidenceCount} dismissals · ${emailSignalReflection.candidateCount} candidates`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Email signal reflection failed";
      await recordCronRun("email-signal-reflection", false, message);
      errors.push(`Email signal reflection: ${message}`);
    }

    try {
      const projectUpdates = await reviewNewProjectUpdates();
      result.projectUpdates = projectUpdates;
      await recordCronRun(
        "project-update-review",
        true,
        `${projectUpdates.analyzed}/${projectUpdates.found} reviewed · ${projectUpdates.needingAttention} need attention`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Project update review failed";
      await recordCronRun("project-update-review", false, message);
      errors.push(`Project update review: ${message}`);
    }

    if (errors.length) result.errors = errors;
    return {
      ok: errors.length === 0,
      note: errors.length ? errors.join(" · ").slice(0, 500) : reflectionNote,
      result,
    };
  },
};

/** Cheap, frequent jobs first so a slow daily job never delays them. */
export const SCHEDULED_JOBS: ScheduledJob[] = [
  notificationEmails,
  standup,
  gmailPoll,
  weeklyDigest,
  wikiSearchIndex,
  agreementIndex,
  recomputeBlockers,
  donationUploadCleanup,
  wikiMediaCleanup,
  securityMonitor,
  assistantReflection,
];
