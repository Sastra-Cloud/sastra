import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";

import { can, type TeamRole } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import {
  wikiMedia,
  wikiPages,
  wikiRevisionMedia,
  wikiRevisions,
  wikiSubjects,
} from "@/lib/db/schema";

export type WikiTreePage = {
  id: string;
  title: string;
  slug: string;
  subjectSlug: string;
  published: boolean;
  hasUnpublishedChanges: boolean;
  sortOrder: number;
};

export type WikiTreeSubject = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  pages: WikiTreePage[];
};

export async function getWikiTree(role: string | null | undefined) {
  const mayEdit = can(role, "wiki.edit");
  const subjects = await db
    .select({
      id: wikiSubjects.id,
      title: wikiSubjects.title,
      slug: wikiSubjects.slug,
      description: wikiSubjects.description,
      sortOrder: wikiSubjects.sortOrder,
    })
    .from(wikiSubjects)
    .where(isNull(wikiSubjects.deletedAt))
    .orderBy(asc(wikiSubjects.sortOrder), asc(wikiSubjects.title));

  if (subjects.length === 0) return [] as WikiTreeSubject[];

  const pages = await db
    .select({
      id: wikiPages.id,
      subjectId: wikiPages.subjectId,
      slug: wikiPages.slug,
      draftTitle: wikiPages.draftTitle,
      draftVersion: wikiPages.draftVersion,
      publishedDraftVersion: wikiPages.publishedDraftVersion,
      publishedRevisionId: wikiPages.publishedRevisionId,
      publishedTitle: wikiRevisions.title,
      sortOrder: wikiPages.sortOrder,
    })
    .from(wikiPages)
    .leftJoin(
      wikiRevisions,
      eq(wikiRevisions.id, wikiPages.publishedRevisionId)
    )
    .where(
      and(
        isNull(wikiPages.deletedAt),
        inArray(
          wikiPages.subjectId,
          subjects.map((subject) => subject.id)
        ),
        mayEdit ? undefined : isNotNull(wikiPages.publishedRevisionId)
      )
    )
    .orderBy(asc(wikiPages.sortOrder), asc(wikiPages.draftTitle));

  const subjectSlug = new Map(subjects.map((subject) => [subject.id, subject.slug]));
  const grouped = new Map<string, WikiTreePage[]>();
  for (const page of pages) {
    const list = grouped.get(page.subjectId) ?? [];
    list.push({
      id: page.id,
      title: mayEdit ? page.draftTitle : page.publishedTitle ?? page.draftTitle,
      slug: page.slug,
      subjectSlug: subjectSlug.get(page.subjectId) ?? "wiki",
      published: !!page.publishedRevisionId,
      hasUnpublishedChanges:
        page.draftVersion !== page.publishedDraftVersion,
      sortOrder: page.sortOrder,
    });
    grouped.set(page.subjectId, list);
  }

  return subjects
    .map((subject) => ({ ...subject, pages: grouped.get(subject.id) ?? [] }))
    .filter((subject) => mayEdit || subject.pages.length > 0);
}

export async function getPublishedWikiPage(subjectSlug: string, pageSlug: string) {
  const [row] = await db
    .select({
      id: wikiPages.id,
      subjectId: wikiSubjects.id,
      subjectTitle: wikiSubjects.title,
      subjectSlug: wikiSubjects.slug,
      pageSlug: wikiPages.slug,
      revisionId: wikiRevisions.id,
      revisionNumber: wikiRevisions.revisionNumber,
      title: wikiRevisions.title,
      summary: wikiRevisions.summary,
      content: wikiRevisions.content,
      publishedAt: wikiRevisions.createdAt,
      publishedBy: wikiRevisions.publishedBy,
      hasUnpublishedChanges: sql<boolean>`${wikiPages.draftVersion} <> ${wikiPages.publishedDraftVersion}`,
    })
    .from(wikiPages)
    .innerJoin(wikiSubjects, eq(wikiSubjects.id, wikiPages.subjectId))
    .innerJoin(wikiRevisions, eq(wikiRevisions.id, wikiPages.publishedRevisionId))
    .where(
      and(
        eq(wikiSubjects.slug, subjectSlug),
        eq(wikiPages.slug, pageSlug),
        isNull(wikiSubjects.deletedAt),
        isNull(wikiPages.deletedAt)
      )
    )
    .limit(1);
  return row ?? null;
}

export async function getWikiDraft(pageId: string) {
  const [row] = await db
    .select({
      id: wikiPages.id,
      subjectId: wikiPages.subjectId,
      subjectTitle: wikiSubjects.title,
      subjectSlug: wikiSubjects.slug,
      slug: wikiPages.slug,
      title: wikiPages.draftTitle,
      summary: wikiPages.draftSummary,
      content: wikiPages.draftContent,
      version: wikiPages.draftVersion,
      publishedDraftVersion: wikiPages.publishedDraftVersion,
      publishedRevisionId: wikiPages.publishedRevisionId,
      updatedAt: wikiPages.updatedAt,
    })
    .from(wikiPages)
    .innerJoin(wikiSubjects, eq(wikiSubjects.id, wikiPages.subjectId))
    .where(
      and(
        eq(wikiPages.id, pageId),
        isNull(wikiPages.deletedAt),
        isNull(wikiSubjects.deletedAt)
      )
    )
    .limit(1);
  return row ?? null;
}

export async function getWikiDraftBySlug(
  subjectSlug: string,
  pageSlug: string
) {
  const [row] = await db
    .select({
      id: wikiPages.id,
      subjectId: wikiPages.subjectId,
      subjectTitle: wikiSubjects.title,
      subjectSlug: wikiSubjects.slug,
      slug: wikiPages.slug,
      title: wikiPages.draftTitle,
      summary: wikiPages.draftSummary,
      content: wikiPages.draftContent,
      version: wikiPages.draftVersion,
      publishedDraftVersion: wikiPages.publishedDraftVersion,
      publishedRevisionId: wikiPages.publishedRevisionId,
      updatedAt: wikiPages.updatedAt,
    })
    .from(wikiPages)
    .innerJoin(wikiSubjects, eq(wikiSubjects.id, wikiPages.subjectId))
    .where(
      and(
        eq(wikiSubjects.slug, subjectSlug),
        eq(wikiPages.slug, pageSlug),
        isNull(wikiPages.deletedAt),
        isNull(wikiSubjects.deletedAt)
      )
    )
    .limit(1);
  return row ?? null;
}

export async function getWikiRevisionHistory(pageId: string) {
  return db
    .select({
      id: wikiRevisions.id,
      revisionNumber: wikiRevisions.revisionNumber,
      title: wikiRevisions.title,
      summary: wikiRevisions.summary,
      publishedBy: wikiRevisions.publishedBy,
      createdAt: wikiRevisions.createdAt,
    })
    .from(wikiRevisions)
    .where(eq(wikiRevisions.pageId, pageId))
    .orderBy(desc(wikiRevisions.revisionNumber));
}

export async function getWikiPageMedia(pageId: string) {
  return db
    .select({
      id: wikiMedia.id,
      kind: wikiMedia.kind,
      status: wikiMedia.status,
      captionStatus: wikiMedia.captionStatus,
      originalName: wikiMedia.originalName,
    })
    .from(wikiMedia)
    .where(and(eq(wikiMedia.pageId, pageId), isNull(wikiMedia.orphanedAt)))
    .orderBy(asc(wikiMedia.createdAt));
}

export async function getWikiRevision(pageId: string, revisionId: string) {
  const [revision] = await db
    .select()
    .from(wikiRevisions)
    .where(
      and(eq(wikiRevisions.pageId, pageId), eq(wikiRevisions.id, revisionId))
    )
    .limit(1);
  return revision ?? null;
}

export async function searchWiki(query: string, role: string | null | undefined) {
  const q = query.trim().slice(0, 120);
  if (q.length < 2) return [];
  const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const published = await db
    .select({
      pageId: wikiPages.id,
      subjectTitle: wikiSubjects.title,
      subjectSlug: wikiSubjects.slug,
      pageSlug: wikiPages.slug,
      title: wikiRevisions.title,
      summary: wikiRevisions.summary,
      searchText: wikiRevisions.searchText,
      updatedAt: wikiRevisions.createdAt,
    })
    .from(wikiPages)
    .innerJoin(wikiSubjects, eq(wikiSubjects.id, wikiPages.subjectId))
    .innerJoin(wikiRevisions, eq(wikiRevisions.id, wikiPages.publishedRevisionId))
    .where(
      and(
        isNull(wikiPages.deletedAt),
        isNull(wikiSubjects.deletedAt),
        or(
          ilike(wikiSubjects.title, like),
          ilike(wikiRevisions.title, like),
          ilike(wikiRevisions.summary, like),
          ilike(wikiRevisions.searchText, like)
        )
      )
    )
    .orderBy(desc(wikiRevisions.createdAt))
    .limit(30);

  if (!can(role, "wiki.edit")) return published;

  const drafts = await db
    .select({
      pageId: wikiPages.id,
      subjectTitle: wikiSubjects.title,
      subjectSlug: wikiSubjects.slug,
      pageSlug: wikiPages.slug,
      title: wikiPages.draftTitle,
      summary: wikiPages.draftSummary,
      searchText: wikiPages.draftSearchText,
      updatedAt: wikiPages.updatedAt,
    })
    .from(wikiPages)
    .innerJoin(wikiSubjects, eq(wikiSubjects.id, wikiPages.subjectId))
    .where(
      and(
        isNull(wikiPages.deletedAt),
        isNull(wikiSubjects.deletedAt),
        or(
          ilike(wikiSubjects.title, like),
          ilike(wikiPages.draftTitle, like),
          ilike(wikiPages.draftSummary, like),
          ilike(wikiPages.draftSearchText, like)
        )
      )
    )
    .orderBy(desc(wikiPages.updatedAt))
    .limit(30);

  const draftIds = new Set(drafts.map((row) => row.pageId));
  return [
    ...drafts.map((row) => ({ ...row, draft: true as const })),
    ...published
      .filter((row) => !draftIds.has(row.pageId))
      .map((row) => ({ ...row, draft: false as const })),
  ].slice(0, 30);
}

export async function getWikiMediaRecord(mediaId: string) {
  const [media] = await db
    .select()
    .from(wikiMedia)
    .where(eq(wikiMedia.id, mediaId))
    .limit(1);
  return media ?? null;
}

export async function mayAccessWikiMedia(
  mediaId: string,
  role: TeamRole | string | null | undefined
) {
  if (can(role, "wiki.edit")) {
    const [row] = await db
      .select({ id: wikiMedia.id })
      .from(wikiMedia)
      .innerJoin(wikiPages, eq(wikiPages.id, wikiMedia.pageId))
      .where(
        and(
          eq(wikiMedia.id, mediaId),
          isNull(wikiPages.deletedAt),
          eq(wikiMedia.status, "ready")
        )
      )
      .limit(1);
    return !!row;
  }
  const [row] = await db
    .select({ id: wikiMedia.id })
    .from(wikiMedia)
    .innerJoin(wikiPages, eq(wikiPages.id, wikiMedia.pageId))
    .innerJoin(
      wikiRevisionMedia,
      and(
        eq(wikiRevisionMedia.mediaId, wikiMedia.id),
        eq(wikiRevisionMedia.revisionId, wikiPages.publishedRevisionId)
      )
    )
    .where(
      and(
        eq(wikiMedia.id, mediaId),
        isNull(wikiPages.deletedAt),
        eq(wikiMedia.status, "ready")
      )
    )
    .limit(1);
  return !!row;
}

export async function getWikiMediaUsage() {
  const [usage] = await db
    .select({
      imageBytes: sql<number>`coalesce(sum(case when ${wikiMedia.kind} = 'image' and ${wikiMedia.status} = 'ready' then ${wikiMedia.sizeBytes} else 0 end), 0)::bigint`,
      videoBytes: sql<number>`coalesce(sum(case when ${wikiMedia.kind} = 'video' and ${wikiMedia.status} = 'ready' and ${wikiMedia.r2Key} is not null then ${wikiMedia.sizeBytes} else 0 end), 0)::bigint`,
      videoSeconds: sql<number>`coalesce(sum(case when ${wikiMedia.kind} = 'video' and ${wikiMedia.status} = 'ready' then ${wikiMedia.durationSeconds} else 0 end), 0)::bigint`,
      videoCount: sql<number>`count(*) filter (where ${wikiMedia.kind} = 'video' and ${wikiMedia.status} = 'ready')::int`,
    })
    .from(wikiMedia);
  return usage ?? { imageBytes: 0, videoBytes: 0, videoSeconds: 0, videoCount: 0 };
}

export async function getTrashedWikiPages() {
  return db
    .select({
      id: wikiPages.id,
      title: wikiPages.draftTitle,
      subjectTitle: wikiSubjects.title,
      deletedAt: wikiPages.deletedAt,
    })
    .from(wikiPages)
    .innerJoin(wikiSubjects, eq(wikiSubjects.id, wikiPages.subjectId))
    .where(isNotNull(wikiPages.deletedAt))
    .orderBy(desc(wikiPages.deletedAt));
}
