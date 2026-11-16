import "server-only";

import { and, eq, inArray, or, sql, type SQLWrapper } from "drizzle-orm";
import { chatChannelMembers, chatChannels, projectManagers, projectMembers, projectPeople, user } from "@/lib/db/schema";
import { MEMBER_SCOPED_CHANNEL_KINDS } from "./channel-members";

/** Also supports correlated callers (read receipts and roster queries). */
export function projectChatAccessCondition(projectId: string | SQLWrapper, userId: string | SQLWrapper) {
  return sql<boolean>`exists (
    select 1 from ${user} as project_chat_person
    where project_chat_person.id = ${userId}
      and project_chat_person.is_active = true and project_chat_person.is_bot = false
      and (
        project_chat_person.role in ('admin', 'super_admin')
        or exists (select 1 from ${projectPeople}
          where ${projectPeople.projectId} = ${projectId} and ${projectPeople.userId} = project_chat_person.id)
        or exists (select 1 from ${projectMembers}
          where ${projectMembers.projectId} = ${projectId} and ${projectMembers.userId} = project_chat_person.id)
        or exists (select 1 from ${projectManagers}
          where ${projectManagers.projectId} = ${projectId} and ${projectManagers.userId} = project_chat_person.id)
      )
  )`;
}

/** One audience rule for pages, polling, actions, summaries, pins, and badges. */
export function channelAccessCondition(userId: string | SQLWrapper) {
  return or(
    eq(chatChannels.kind, "general"),
    and(eq(chatChannels.kind, "project"), projectChatAccessCondition(chatChannels.projectId, userId)),
    and(inArray(chatChannels.kind, [...MEMBER_SCOPED_CHANNEL_KINDS]), sql`exists (
      select 1 from ${chatChannelMembers}
      where ${chatChannelMembers.channelId} = ${chatChannels.id} and ${chatChannelMembers.userId} = ${userId}
    )`)
  )!;
}
