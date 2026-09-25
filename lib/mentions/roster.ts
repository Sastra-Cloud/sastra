import "server-only";

import { and, asc, eq, inArray, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { projectMembers, user } from "@/lib/db/schema";

/** A person who can be @mentioned: enough to render the picker and to match. */
export type MentionTarget = {
  id: string;
  name: string;
  email: string;
  image: string | null;
};

const selection = {
  id: user.id,
  name: user.name,
  email: user.email,
  image: user.image,
};

/** Every active, human teammate. Used for team channels and general tasks. */
export async function listAllMentionTargets(): Promise<MentionTarget[]> {
  return db
    .select(selection)
    .from(user)
    .where(and(eq(user.isBot, false), eq(user.isActive, true)))
    .orderBy(asc(user.name));
}

/** Exact active-human roster for private conversations and other closed scopes. */
export async function listMentionTargetsByIds(
  userIds: string[]
): Promise<MentionTarget[]> {
  if (userIds.length === 0) return [];
  return db
    .select(selection)
    .from(user)
    .where(
      and(
        eq(user.isBot, false),
        eq(user.isActive, true),
        inArray(user.id, userIds)
      )
    )
    .orderBy(asc(user.name));
}

/**
 * People taggable from a project surface: its members plus managers/admins
 * (who can see every project anyway). Scoping to these avoids notifying — and
 * leaking a snippet to — someone with no access to the project.
 */
export async function listProjectMentionTargets(
  projectId: string
): Promise<MentionTarget[]> {
  const memberRows = await db
    .select({ userId: projectMembers.userId })
    .from(projectMembers)
    .where(eq(projectMembers.projectId, projectId));
  const memberIds = memberRows.map((m) => m.userId);

  const scope = memberIds.length
    ? or(
        inArray(user.role, ["manager", "admin", "super_admin"]),
        inArray(user.id, memberIds)
      )
    : inArray(user.role, ["manager", "admin", "super_admin"]);

  return db
    .select(selection)
    .from(user)
    .where(and(eq(user.isBot, false), eq(user.isActive, true), scope))
    .orderBy(asc(user.name));
}
