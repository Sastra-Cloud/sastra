import "server-only";

import { and, asc, eq, inArray, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { projectManagers, projectMembers, projectPeople, user } from "@/lib/db/schema";

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

/** Project people, work-role members, project managers, and workspace admins. */
export async function listProjectMentionTargets(
  projectId: string
): Promise<MentionTarget[]> {
  const members = db.select({ userId: projectMembers.userId }).from(projectMembers)
    .where(eq(projectMembers.projectId, projectId));
  const people = db.select({ userId: projectPeople.userId }).from(projectPeople)
    .where(eq(projectPeople.projectId, projectId));
  const managers = db.select({ userId: projectManagers.userId }).from(projectManagers)
    .where(eq(projectManagers.projectId, projectId));

  // Filter through the user table once so overlapping roles never duplicate a person.
  return db
    .select(selection)
    .from(user)
    .where(and(
      eq(user.isBot, false),
      eq(user.isActive, true),
      or(
        inArray(user.role, ["admin", "super_admin"]),
        inArray(user.id, people),
        inArray(user.id, members),
        inArray(user.id, managers)
      )
    ))
    .orderBy(asc(user.name));
}
