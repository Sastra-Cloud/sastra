import "server-only";

import { and, eq, isNull, ne, notInArray, or, sql } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";

import { db } from "@/lib/db";
import {
  channelReads,
  chatChannelMembers,
  chatChannels,
  chatMessages,
  printPayments,
  projects,
  standupRuns,
  standups,
  tasks,
} from "@/lib/db/schema";
import { canManage } from "@/lib/auth/policy";
import { listPendingEmailTaskSuggestionsForUser } from "@/lib/email/task-suggestions";
import { externalFollowUpEffectiveDueAt, listMyExternalFollowUps } from "@/lib/email/follow-ups";
import { countDueWorkTasks, type NavigationBadgeCounts } from "./badges";
import { countThreadsNeedingReview } from "@/lib/email/queries";

/** No channel bootstrapping, message bodies, or per-channel queries on this feed. */
async function unreadChatCount(userId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(${chatMessages.id})::int` })
    .from(chatChannels)
    .leftJoin(projects, eq(projects.id, chatChannels.projectId))
    .leftJoin(chatChannelMembers, and(
      eq(chatChannelMembers.channelId, chatChannels.id),
      eq(chatChannelMembers.userId, userId)
    ))
    .leftJoin(channelReads, and(
      eq(channelReads.channelId, chatChannels.id),
      eq(channelReads.userId, userId)
    ))
    .innerJoin(chatMessages, and(
      eq(chatMessages.channelId, chatChannels.id),
      isNull(chatMessages.deletedAt),
      // Deleted authors' messages still count; the current user's own never do.
      or(isNull(chatMessages.userId), ne(chatMessages.userId, userId)),
      sql`${chatMessages.id} > coalesce(${channelReads.lastReadMessageId}, '00000000-0000-0000-0000-000000000000'::uuid)`
    ))
    .where(and(
      ne(chatChannels.kind, "standup"),
      or(
        and(eq(chatChannels.kind, "project"), notInArray(projects.status, ["completed", "cancelled"])),
        and(isNull(chatChannels.projectId), eq(chatChannels.kind, "general")),
        and(isNull(chatChannels.projectId), eq(chatChannelMembers.userId, userId))
      )
    ));
  return row.count;
}

async function openStandupCount(userId: string, now: Date) {
  const [row] = await db.select({ count: sql<number>`count(*)::int` })
    .from(standupRuns)
    .innerJoin(standups, eq(standups.id, standupRuns.standupId))
    .where(and(
      eq(standupRuns.userId, userId),
      eq(standupRuns.status, "in_progress"),
      eq(standups.isActive, true),
      sql`${standupRuns.channelId} is not null`,
      sql`${standupRuns.runDate} = (${now.toISOString()}::timestamptz at time zone ${standups.timezone})::date`
    ));
  return row.count;
}

/** Viewer always comes from the server session; no client-supplied identity. */
export async function getNavigationBadgeCounts(
  viewer: { id: string; role?: string | null },
  timeZone: string,
  now = new Date()
): Promise<NavigationBadgeCounts> {
  const [work, suggestions, followUps, chat, standupCount, correspondence] = await Promise.all([
    db.select({
      status: tasks.status,
      assignedTo: tasks.assignedTo,
      dueDate: tasks.dueDate,
      printPaymentStatus: printPayments.status,
      printWireRequestedAt: printPayments.wireRequestedAt,
      printPaymentDueDate: printPayments.dueDate,
      printPaymentNeededByDate: printPayments.neededByDate,
    }).from(tasks)
      .leftJoin(printPayments, eq(printPayments.id, tasks.printPaymentId))
      .where(and(eq(tasks.assignedTo, viewer.id), ne(tasks.status, "done"))),
    // Reuse the review queue's stale-forward filtering so hidden suggestions
    // cannot leave a badge that the person has no way to clear.
    listPendingEmailTaskSuggestionsForUser(viewer.id),
    canManage(viewer.role) ? listMyExternalFollowUps(viewer.id) : Promise.resolve([]),
    unreadChatCount(viewer.id),
    openStandupCount(viewer.id, now),
    canManage(viewer.role) ? countThreadsNeedingReview(now) : Promise.resolve(0),
  ]);
  return {
    dueTasks: countDueWorkTasks(work, viewer.id, formatInTimeZone(now, timeZone, "yyyy-MM-dd"), timeZone),
    taskSuggestions: suggestions.length,
    followUps: followUps.filter((item) => externalFollowUpEffectiveDueAt(item) <= now).length,
    chat,
    standups: standupCount,
    correspondence,
  };
}
