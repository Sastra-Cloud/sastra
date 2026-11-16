import "server-only";

import { and, asc, eq, inArray, or } from "drizzle-orm";
import { db, type Db } from "@/lib/db";
import { defaultProjectPeople, projectManagers, projectMembers, projectPeople, user } from "@/lib/db/schema";

export async function listProjectPeople(projectId: string) {
  const people = db.select({ userId: projectPeople.userId }).from(projectPeople).where(eq(projectPeople.projectId, projectId));
  const roles = db.select({ userId: projectMembers.userId }).from(projectMembers).where(eq(projectMembers.projectId, projectId));
  const managers = db.select({ userId: projectManagers.userId }).from(projectManagers).where(eq(projectManagers.projectId, projectId));
  return db.select({ id: user.id, name: user.name, image: user.image }).from(user).where(and(
    eq(user.isActive, true), eq(user.isBot, false),
    or(inArray(user.id, people), inArray(user.id, roles), inArray(user.id, managers))
  )).orderBy(asc(user.name));
}

export async function listDefaultProjectPeople() {
  return db.select({ id: user.id, name: user.name, image: user.image }).from(defaultProjectPeople)
    .innerJoin(user, eq(user.id, defaultProjectPeople.userId))
    .where(and(eq(user.isActive, true), eq(user.isBot, false))).orderBy(asc(user.name));
}

/** Creation snapshots the saved roster; subsequent default edits are not retroactive. */
export async function addDefaultProjectPeople(
  tx: Parameters<Parameters<Db["transaction"]>[0]>[0], projectId: string, actorId: string
) {
  const defaults = await tx.select({ userId: user.id }).from(defaultProjectPeople)
    .innerJoin(user, eq(user.id, defaultProjectPeople.userId))
    .where(and(eq(user.isActive, true), eq(user.isBot, false)));
  if (defaults.length) await tx.insert(projectPeople).values(defaults.map(({ userId }) => ({ projectId, userId, addedBy: actorId }))).onConflictDoNothing();
}
