import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import {
  emailProjectUpdateSuggestions,
  notifications,
  projects,
  user,
} from "@/lib/db/schema";
import { notifyMany } from "@/lib/notifications";
import {
  buildPrintProofProjectUpdate,
  shouldSuggestProjectUpdateFromProof,
  type ProjectUpdateSuggestionData,
} from "@/lib/email/project-update-suggestion-policy";
import { latestReplyText } from "@/lib/email/follow-up-policy";

const TYPE = "possible_project_update";

export async function ensurePrintProofProjectUpdateSuggestion(input: {
  threadId: string;
  messageId: string;
  projectId: string;
  bodyText: string | null;
}): Promise<boolean> {
  const currentMessageText = latestReplyText(input.bodyText);
  if (!shouldSuggestProjectUpdateFromProof(currentMessageText)) return false;

  const [[project], managers] = await Promise.all([
    db
      .select({ id: projects.id, slug: projects.slug, title: projects.title })
      .from(projects)
      .where(eq(projects.id, input.projectId))
      .limit(1),
    db
      .select({ id: user.id })
      .from(user)
      .where(
        and(
          eq(user.isActive, true),
          eq(user.isBot, false),
          inArray(user.role, ["manager", "admin", "super_admin"])
        )
      ),
  ]);
  if (!project || !managers.length) return false;

  const copy = buildPrintProofProjectUpdate(currentMessageText);
  const [created] = await db
    .insert(emailProjectUpdateSuggestions)
    .values({
      threadId: input.threadId,
      messageId: input.messageId,
      projectId: project.id,
      ...copy,
    })
    .onConflictDoNothing()
    .returning({ id: emailProjectUpdateSuggestions.id });
  if (!created) return false;

  await notifyMany(
    managers.map((manager) => manager.id),
    {
      type: TYPE,
      title: "Project status update suggested",
      body: copy.suggestedBody,
      link: `/correspondence/${input.threadId}`,
      project: project.title,
      data: { threadId: input.threadId, suggestionId: created.id },
      email: false,
    }
  );
  return true;
}

export type ProjectUpdateSuggestion = ProjectUpdateSuggestionData & {
  suggestionId: string;
};

export async function listProjectUpdateSuggestions(
  threadId: string
): Promise<ProjectUpdateSuggestion[]> {
  await requireRole("manager");
  return db
    .select({
      suggestionId: emailProjectUpdateSuggestions.id,
      threadId: emailProjectUpdateSuggestions.threadId,
      messageId: emailProjectUpdateSuggestions.messageId,
      projectId: emailProjectUpdateSuggestions.projectId,
      projectSlug: projects.slug,
      projectTitle: projects.title,
      suggestedBody: emailProjectUpdateSuggestions.suggestedBody,
      reason: emailProjectUpdateSuggestions.reason,
    })
    .from(emailProjectUpdateSuggestions)
    .innerJoin(projects, eq(projects.id, emailProjectUpdateSuggestions.projectId))
    .where(
      and(
        eq(emailProjectUpdateSuggestions.threadId, threadId),
        eq(emailProjectUpdateSuggestions.status, "pending")
      )
    )
    .orderBy(desc(emailProjectUpdateSuggestions.createdAt));
}

export async function clearProjectUpdateSuggestionNotifications(
  suggestionId: string
) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.type, TYPE),
        sql`(${notifications.data} ->> 'suggestionId') = ${suggestionId}`
      )
    );
}
