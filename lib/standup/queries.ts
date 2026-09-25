import "server-only";

import { asc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  standupParticipants,
  standupQuestions,
  standups,
  user,
} from "@/lib/db/schema";

export async function listStandups() {
  const rows = await db.select().from(standups).orderBy(asc(standups.name));
  const counts = await db
    .select({
      standupId: standupParticipants.standupId,
      n: sql<number>`count(*)::int`,
    })
    .from(standupParticipants)
    .groupBy(standupParticipants.standupId);
  const map = new Map(counts.map((c) => [c.standupId, c.n]));
  return rows.map((s) => ({ ...s, participantCount: map.get(s.id) ?? 0 }));
}

export async function getStandup(id: string) {
  const [standup] = await db
    .select()
    .from(standups)
    .where(eq(standups.id, id))
    .limit(1);
  if (!standup) return null;

  const [questions, participants] = await Promise.all([
    db
      .select()
      .from(standupQuestions)
      .where(eq(standupQuestions.standupId, id))
      .orderBy(asc(standupQuestions.orderIndex)),
    db
      .select({
        id: standupParticipants.id,
        userId: standupParticipants.userId,
        userName: user.name,
      })
      .from(standupParticipants)
      .innerJoin(user, eq(user.id, standupParticipants.userId))
      .where(eq(standupParticipants.standupId, id)),
  ]);

  return { standup, questions, participants };
}
