import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  ne,
  sql,
} from "drizzle-orm";

import { db } from "@/lib/db";
import { projectUpdates, projects, user } from "@/lib/db/schema";
import type { ProjectUpdateAnalysis } from "./update-review-schema";

export type StatusReply = {
  id: string;
  userId: string | null;
  authorName: string | null;
  authorImage: string | null;
  body: string;
  createdAt: Date;
};

export type StatusUpdate = {
  id: string;
  userId: string | null;
  authorName: string | null;
  authorImage: string | null;
  body: string;
  aiAnalysis: ProjectUpdateAnalysis | null;
  aiAnalyzedAt: Date | null;
  aiReviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ProjectStatus = {
  update: StatusUpdate;
  replies: StatusReply[];
  earlierCount: number;
};

/** Latest top-level status update + its replies + count of earlier updates. */
export async function getLatestProjectUpdate(
  projectId: string
): Promise<ProjectStatus | null> {
  const [update] = await db
    .select({
      id: projectUpdates.id,
      userId: projectUpdates.userId,
      authorName: user.name,
      authorImage: user.image,
      body: projectUpdates.body,
      aiAnalysis: projectUpdates.aiAnalysis,
      aiAnalyzedAt: projectUpdates.aiAnalyzedAt,
      aiReviewedAt: projectUpdates.aiReviewedAt,
      createdAt: projectUpdates.createdAt,
      updatedAt: projectUpdates.updatedAt,
    })
    .from(projectUpdates)
    .leftJoin(user, eq(user.id, projectUpdates.userId))
    .where(
      and(eq(projectUpdates.projectId, projectId), isNull(projectUpdates.parentId))
    )
    .orderBy(desc(projectUpdates.createdAt))
    .limit(1);
  if (!update) return null;

  const [replies, [countRow]] = await Promise.all([
    db
      .select({
        id: projectUpdates.id,
        userId: projectUpdates.userId,
        authorName: user.name,
        authorImage: user.image,
        body: projectUpdates.body,
        createdAt: projectUpdates.createdAt,
      })
      .from(projectUpdates)
      .leftJoin(user, eq(user.id, projectUpdates.userId))
      .where(eq(projectUpdates.parentId, update.id))
      .orderBy(asc(projectUpdates.createdAt)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(projectUpdates)
      .where(
        and(
          eq(projectUpdates.projectId, projectId),
          isNull(projectUpdates.parentId)
        )
      ),
  ]);

  return {
    update,
    replies,
    earlierCount: Math.max(0, Number(countRow?.n ?? 1) - 1),
  };
}

export type ManagerUpdateRecommendation = {
  updateId: string;
  projectId: string;
  projectSlug: string;
  projectTitle: string;
  body: string;
  createdAt: Date;
  analysis: ProjectUpdateAnalysis;
};

/** Unreviewed, actionable AI follow-ups for manager review surfaces. */
export async function listManagerUpdateRecommendations(
  limit = 8
): Promise<ManagerUpdateRecommendation[]> {
  const rows = await db
    .select({
      updateId: projectUpdates.id,
      projectId: projects.id,
      projectSlug: projects.slug,
      projectTitle: projects.title,
      body: projectUpdates.body,
      createdAt: projectUpdates.createdAt,
      analysis: projectUpdates.aiAnalysis,
    })
    .from(projectUpdates)
    .innerJoin(projects, eq(projects.id, projectUpdates.projectId))
    .where(
      and(
        isNull(projectUpdates.parentId),
        isNotNull(projectUpdates.aiAnalysis),
        isNull(projectUpdates.aiReviewedAt),
        ne(projects.status, "completed"),
        ne(projects.status, "cancelled"),
        sql`not exists (
          select 1
          from project_updates newer
          where newer.project_id = ${projectUpdates.projectId}
            and newer.parent_id is null
            and newer.created_at > ${projectUpdates.createdAt}
        )`,
        sql`coalesce((${projectUpdates.aiAnalysis} ->> 'needsManagerAttention')::boolean, false) = true`
      )
    )
    .orderBy(
      sql`case ${projectUpdates.aiAnalysis} ->> 'priority' when 'high' then 0 when 'medium' then 1 else 2 end`,
      desc(projectUpdates.createdAt)
    )
    .limit(Math.max(1, Math.min(20, limit)));

  return rows.filter(
    (row): row is typeof row & { analysis: ProjectUpdateAnalysis } =>
      row.analysis !== null
  );
}

export type EarlierUpdate = {
  id: string;
  authorName: string | null;
  body: string;
  createdAt: Date;
  replyCount: number;
};

/** Prior top-level updates (excluding the latest), for the "earlier updates" toggle. */
export async function listEarlierProjectUpdates(
  projectId: string
): Promise<EarlierUpdate[]> {
  const rows = await db
    .select({
      id: projectUpdates.id,
      authorName: user.name,
      body: projectUpdates.body,
      createdAt: projectUpdates.createdAt,
    })
    .from(projectUpdates)
    .leftJoin(user, eq(user.id, projectUpdates.userId))
    .where(
      and(eq(projectUpdates.projectId, projectId), isNull(projectUpdates.parentId))
    )
    .orderBy(desc(projectUpdates.createdAt));

  const earlier = rows.slice(1); // drop the latest
  if (earlier.length === 0) return [];

  const counts = await db
    .select({ parentId: projectUpdates.parentId, n: sql<number>`count(*)::int` })
    .from(projectUpdates)
    .where(inArray(projectUpdates.parentId, earlier.map((r) => r.id)))
    .groupBy(projectUpdates.parentId);
  const byParent = new Map(counts.map((c) => [c.parentId, Number(c.n)]));

  return earlier.map((r) => ({ ...r, replyCount: byParent.get(r.id) ?? 0 }));
}
