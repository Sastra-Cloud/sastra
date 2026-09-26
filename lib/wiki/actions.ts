"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import {
  and,
  eq,
  inArray,
  isNull,
  notInArray,
  sql,
} from "drizzle-orm";
import { z } from "zod";

import type { ActionResult } from "@/lib/actions/result";
import { logActivity } from "@/lib/activity/log";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import {
  wikiMedia,
  wikiPages,
  wikiRevisionMedia,
  wikiRevisions,
  wikiSearchChunks,
  wikiSubjects,
  type WikiDocument,
} from "@/lib/db/schema";
import { slugify } from "@/lib/slug";
import {
  EMPTY_WIKI_DOCUMENT,
  TUTORIAL_WIKI_DOCUMENT,
  validateWikiDocument,
} from "@/lib/wiki/content";
import {
  buildWikiSearchChunks,
  WIKI_CHUNKER_VERSION,
} from "@/lib/wiki/search-chunks";
import { embedWikiRevision } from "@/lib/wiki/search-index";
import { requestScheduledTick } from "@/lib/hosted/tick-request";

const titleSchema = z.string().trim().min(1).max(160);
const summarySchema = z.string().trim().max(500).nullable().optional();
const uuidSchema = z.string().uuid();

function error(message: string, code?: string): ActionResult<never> {
  return { ok: false, error: { message, code } };
}

async function uniqueSubjectSlug(title: string) {
  const base = slugify(title);
  let candidate = base;
  let suffix = 1;
  while (
    (
      await db
        .select({ id: wikiSubjects.id })
        .from(wikiSubjects)
        .where(eq(wikiSubjects.slug, candidate))
        .limit(1)
    ).length > 0
  ) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
  return candidate;
}

async function uniquePageSlug(subjectId: string, title: string) {
  const base = slugify(title);
  let candidate = base;
  let suffix = 1;
  while (
    (
      await db
        .select({ id: wikiPages.id })
        .from(wikiPages)
        .where(
          and(eq(wikiPages.subjectId, subjectId), eq(wikiPages.slug, candidate))
        )
        .limit(1)
    ).length > 0
  ) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
  return candidate;
}

export async function createWikiSubject(input: {
  title: string;
  description?: string;
}): Promise<ActionResult<{ id: string; slug: string }>> {
  const { user } = await requireRole("manager");
  const parsed = z
    .object({ title: titleSchema, description: z.string().trim().max(500).optional() })
    .safeParse(input);
  if (!parsed.success) return error(parsed.error.issues[0]?.message ?? "Invalid subject.");

  const [{ nextOrder }] = await db
    .select({ nextOrder: sql<number>`coalesce(max(${wikiSubjects.sortOrder}), -1) + 1` })
    .from(wikiSubjects)
    .where(isNull(wikiSubjects.deletedAt));
  const slug = await uniqueSubjectSlug(parsed.data.title);
  const [created] = await db
    .insert(wikiSubjects)
    .values({
      title: parsed.data.title,
      description: parsed.data.description || null,
      slug,
      sortOrder: Number(nextOrder ?? 0),
      createdBy: user.id,
      updatedBy: user.id,
    })
    .returning({ id: wikiSubjects.id, slug: wikiSubjects.slug });

  await logActivity({
    actorId: user.id,
    entityType: "wiki_subject",
    entityId: created.id,
    action: "created",
    summary: `Created wiki subject “${parsed.data.title}”`,
  });
  revalidatePath("/wiki");
  return { ok: true, data: created };
}

export async function updateWikiSubject(input: {
  id: string;
  title: string;
  description?: string | null;
}): Promise<ActionResult> {
  const { user } = await requireRole("manager");
  const parsed = z
    .object({ id: uuidSchema, title: titleSchema, description: summarySchema })
    .safeParse(input);
  if (!parsed.success) return error(parsed.error.issues[0]?.message ?? "Invalid subject.");
  await db
    .update(wikiSubjects)
    .set({
      title: parsed.data.title,
      description: parsed.data.description || null,
      updatedBy: user.id,
      updatedAt: new Date(),
    })
    .where(and(eq(wikiSubjects.id, parsed.data.id), isNull(wikiSubjects.deletedAt)));
  revalidatePath("/wiki");
  return { ok: true };
}

export async function reorderWikiSubjects(ids: string[]): Promise<ActionResult> {
  await requireRole("manager");
  const parsed = z.array(uuidSchema).min(1).max(200).safeParse(ids);
  if (!parsed.success || new Set(parsed.data).size !== parsed.data.length) {
    return error("Subject order is invalid.");
  }
  await db.transaction(async (tx) => {
    for (const [sortOrder, id] of parsed.data.entries()) {
      await tx
        .update(wikiSubjects)
        .set({ sortOrder, updatedAt: new Date() })
        .where(eq(wikiSubjects.id, id));
    }
  });
  revalidatePath("/wiki");
  return { ok: true };
}

export async function createWikiPage(input: {
  subjectId: string;
  title: string;
  tutorialTemplate?: boolean;
}): Promise<ActionResult<{ id: string; href: string }>> {
  const { user } = await requireRole("manager");
  const parsed = z
    .object({ subjectId: uuidSchema, title: titleSchema, tutorialTemplate: z.boolean().optional() })
    .safeParse(input);
  if (!parsed.success) return error(parsed.error.issues[0]?.message ?? "Invalid page.");

  const [subject] = await db
    .select({ id: wikiSubjects.id, slug: wikiSubjects.slug })
    .from(wikiSubjects)
    .where(and(eq(wikiSubjects.id, parsed.data.subjectId), isNull(wikiSubjects.deletedAt)))
    .limit(1);
  if (!subject) return error("That wiki subject no longer exists.");

  const [{ nextOrder }] = await db
    .select({ nextOrder: sql<number>`coalesce(max(${wikiPages.sortOrder}), -1) + 1` })
    .from(wikiPages)
    .where(and(eq(wikiPages.subjectId, subject.id), isNull(wikiPages.deletedAt)));
  const slug = await uniquePageSlug(subject.id, parsed.data.title);
  const content = parsed.data.tutorialTemplate
    ? TUTORIAL_WIKI_DOCUMENT
    : EMPTY_WIKI_DOCUMENT;
  const validated = validateWikiDocument(content);
  const [created] = await db
    .insert(wikiPages)
    .values({
      subjectId: subject.id,
      slug,
      draftTitle: parsed.data.title,
      draftContent: content,
      draftSearchText: validated.ok ? validated.text : "",
      sortOrder: Number(nextOrder ?? 0),
      createdBy: user.id,
      updatedBy: user.id,
    })
    .returning({ id: wikiPages.id });

  await logActivity({
    actorId: user.id,
    entityType: "wiki_page",
    entityId: created.id,
    action: "created",
    summary: `Created wiki draft “${parsed.data.title}”`,
  });
  revalidatePath("/wiki");
  return {
    ok: true,
    data: { id: created.id, href: `/wiki/${subject.slug}/${slug}/edit` },
  };
}

export async function reorderWikiPages(input: {
  subjectId: string;
  pageIds: string[];
}): Promise<ActionResult> {
  await requireRole("manager");
  const parsed = z
    .object({ subjectId: uuidSchema, pageIds: z.array(uuidSchema).min(1).max(500) })
    .safeParse(input);
  if (!parsed.success || new Set(parsed.data.pageIds).size !== parsed.data.pageIds.length) {
    return error("Page order is invalid.");
  }
  await db.transaction(async (tx) => {
    for (const [sortOrder, id] of parsed.data.pageIds.entries()) {
      await tx
        .update(wikiPages)
        .set({ sortOrder, updatedAt: new Date() })
        .where(and(eq(wikiPages.id, id), eq(wikiPages.subjectId, parsed.data.subjectId)));
    }
  });
  revalidatePath("/wiki");
  return { ok: true };
}

export async function updateWikiPageDraft(input: {
  pageId: string;
  expectedVersion: number;
  title: string;
  summary?: string | null;
  content: WikiDocument;
}): Promise<ActionResult<{ version: number; updatedAt: string }>> {
  const { user } = await requireRole("manager");
  const meta = z
    .object({
      pageId: uuidSchema,
      expectedVersion: z.number().int().positive(),
      title: titleSchema,
      summary: summarySchema,
    })
    .safeParse(input);
  if (!meta.success) return error(meta.error.issues[0]?.message ?? "Invalid draft.");
  const content = validateWikiDocument(input.content);
  if (!content.ok) return error(content.error);

  if (content.mediaIds.length > 0) {
    const owned = await db
      .select({ id: wikiMedia.id })
      .from(wikiMedia)
      .where(
        and(
          eq(wikiMedia.pageId, meta.data.pageId),
          inArray(wikiMedia.id, content.mediaIds)
        )
      );
    if (owned.length !== content.mediaIds.length) {
      return error("This draft references media from another wiki page.");
    }
  }

  const updatedAt = new Date();
  const [updated] = await db
    .update(wikiPages)
    .set({
      draftTitle: meta.data.title,
      draftSummary: meta.data.summary || null,
      draftContent: content.document,
      draftSearchText: [meta.data.title, meta.data.summary, content.text]
        .filter(Boolean)
        .join(" "),
      draftVersion: sql`${wikiPages.draftVersion} + 1`,
      updatedBy: user.id,
      updatedAt,
    })
    .where(
      and(
        eq(wikiPages.id, meta.data.pageId),
        eq(wikiPages.draftVersion, meta.data.expectedVersion),
        isNull(wikiPages.deletedAt)
      )
    )
    .returning({ version: wikiPages.draftVersion });

  if (!updated) {
    return error(
      "Someone else saved a newer version of this draft. Your unsaved work remains in this tab until you reload.",
      "WIKI_CONFLICT"
    );
  }
  const publishedMedia = await db
    .select({ id: wikiRevisionMedia.mediaId })
    .from(wikiRevisionMedia)
    .innerJoin(wikiRevisions, eq(wikiRevisions.id, wikiRevisionMedia.revisionId))
    .where(eq(wikiRevisions.pageId, meta.data.pageId));
  const retainedIds = [
    ...new Set([...content.mediaIds, ...publishedMedia.map((item) => item.id)]),
  ];
  if (retainedIds.length > 0) {
    await db
      .update(wikiMedia)
      .set({ orphanedAt: null, updatedAt: new Date() })
      .where(
        and(
          eq(wikiMedia.pageId, meta.data.pageId),
          inArray(wikiMedia.id, retainedIds)
        )
      );
    await db
      .update(wikiMedia)
      .set({ orphanedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(wikiMedia.pageId, meta.data.pageId),
          isNull(wikiMedia.orphanedAt),
          notInArray(wikiMedia.id, retainedIds)
        )
      );
  } else {
    await db
      .update(wikiMedia)
      .set({ orphanedAt: new Date(), updatedAt: new Date() })
      .where(
        and(eq(wikiMedia.pageId, meta.data.pageId), isNull(wikiMedia.orphanedAt))
      );
  }
  revalidatePath("/wiki");
  return { ok: true, data: { version: updated.version, updatedAt: updatedAt.toISOString() } };
}

export async function publishWikiPage(pageId: string): Promise<ActionResult<{ revisionId: string }>> {
  const { user } = await requireRole("manager");
  const id = uuidSchema.safeParse(pageId);
  if (!id.success) return error("Page identifier is invalid.");

  const result = await db.transaction(async (tx) => {
    const [page] = await tx
      .select()
      .from(wikiPages)
      .where(and(eq(wikiPages.id, id.data), isNull(wikiPages.deletedAt)))
      .limit(1);
    if (!page) return error("That wiki page no longer exists.");
    const content = validateWikiDocument(page.draftContent);
    if (!content.ok) return error(content.error);

    if (content.mediaIds.length > 0) {
      const media = await tx
        .select({
          id: wikiMedia.id,
          pageId: wikiMedia.pageId,
          status: wikiMedia.status,
        })
        .from(wikiMedia)
        .where(inArray(wikiMedia.id, content.mediaIds));
      if (media.length !== content.mediaIds.length || media.some((item) => item.pageId !== page.id)) {
        return error("This page references media that does not belong to it.");
      }
      const unavailable = media.find((item) => item.status !== "ready");
      if (unavailable) return error("Wait for every image and video to finish processing before publishing.");
    }

    const [{ nextRevision }] = await tx
      .select({ nextRevision: sql<number>`coalesce(max(${wikiRevisions.revisionNumber}), 0) + 1` })
      .from(wikiRevisions)
      .where(eq(wikiRevisions.pageId, page.id));
    const [revision] = await tx
      .insert(wikiRevisions)
      .values({
        pageId: page.id,
        revisionNumber: Number(nextRevision ?? 1),
        title: page.draftTitle,
        summary: page.draftSummary,
        content: content.document,
        searchText: [page.draftTitle, page.draftSummary, content.text]
          .filter(Boolean)
          .join(" "),
        publishedBy: user.id,
      })
      .returning({ id: wikiRevisions.id });
    const [subject] = await tx
      .select({ title: wikiSubjects.title, slug: wikiSubjects.slug })
      .from(wikiSubjects)
      .where(eq(wikiSubjects.id, page.subjectId))
      .limit(1);
    if (!subject) return error("That wiki subject no longer exists.");
    const chunks = buildWikiSearchChunks({
      subjectTitle: subject.title,
      subjectSlug: subject.slug,
      pageSlug: page.slug,
      pageTitle: page.draftTitle,
      summary: page.draftSummary,
      document: content.document,
    });
    await tx.delete(wikiSearchChunks).where(eq(wikiSearchChunks.pageId, page.id));
    await tx.insert(wikiSearchChunks).values(
      chunks.map((chunk) => ({
        pageId: page.id,
        revisionId: revision.id,
        chunkIndex: chunk.chunkIndex,
        chunkerVersion: WIKI_CHUNKER_VERSION,
        subjectTitle: subject.title,
        subjectSlug: subject.slug,
        pageSlug: page.slug,
        pageTitle: page.draftTitle,
        summary: page.draftSummary,
        section: chunk.section,
        anchor: chunk.anchor,
        content: chunk.content,
        searchText: chunk.searchText,
        embeddingText: chunk.embeddingText,
        containsVideo: chunk.containsVideo,
      }))
    );
    if (content.mediaIds.length > 0) {
      await tx.insert(wikiRevisionMedia).values(
        content.mediaIds.map((mediaId) => ({ revisionId: revision.id, mediaId }))
      );
    }
    await tx
      .update(wikiPages)
      .set({
        publishedRevisionId: revision.id,
        publishedDraftVersion: page.draftVersion,
        publishedAt: new Date(),
        updatedBy: user.id,
        updatedAt: new Date(),
      })
      .where(eq(wikiPages.id, page.id));
    return { ok: true as const, data: { revisionId: revision.id } };
  });

  if (!result.ok) return result;
  if (!result.data) return error("The published revision could not be created.");
  after(async () => {
    try {
      await embedWikiRevision(result.data.revisionId);
    } catch (embeddingError) {
      console.error("Immediate Wiki embedding failed; cron will retry:", embeddingError);
    }
    // A follow-up pass retries anything that failed (Sastra Cloud only).
    requestScheduledTick(new Date(Date.now() + 5 * 60_000));
  });
  await logActivity({
    actorId: user.id,
    entityType: "wiki_page",
    entityId: pageId,
    action: "published",
    summary: "Published a wiki page revision",
    data: { revisionId: result.data.revisionId },
  });
  revalidatePath("/wiki");
  return result;
}

export async function restoreWikiRevision(input: {
  pageId: string;
  revisionId: string;
}): Promise<ActionResult<{ version: number }>> {
  const { user } = await requireRole("manager");
  const parsed = z.object({ pageId: uuidSchema, revisionId: uuidSchema }).safeParse(input);
  if (!parsed.success) return error("Revision identifier is invalid.");
  const [revision] = await db
    .select()
    .from(wikiRevisions)
    .where(
      and(
        eq(wikiRevisions.id, parsed.data.revisionId),
        eq(wikiRevisions.pageId, parsed.data.pageId)
      )
    )
    .limit(1);
  if (!revision) return error("That revision no longer exists.");
  const [page] = await db
    .update(wikiPages)
    .set({
      draftTitle: revision.title,
      draftSummary: revision.summary,
      draftContent: revision.content,
      draftSearchText: revision.searchText,
      draftVersion: sql`${wikiPages.draftVersion} + 1`,
      updatedBy: user.id,
      updatedAt: new Date(),
    })
    .where(and(eq(wikiPages.id, parsed.data.pageId), isNull(wikiPages.deletedAt)))
    .returning({ version: wikiPages.draftVersion });
  if (!page) return error("That wiki page no longer exists.");
  revalidatePath("/wiki");
  return { ok: true, data: page };
}

export async function trashWikiPage(pageId: string): Promise<ActionResult> {
  const { user } = await requireRole("manager");
  const id = uuidSchema.safeParse(pageId);
  if (!id.success) return error("Page identifier is invalid.");
  const [page] = await db
    .update(wikiPages)
    .set({ deletedAt: new Date(), updatedBy: user.id, updatedAt: new Date() })
    .where(and(eq(wikiPages.id, id.data), isNull(wikiPages.deletedAt)))
    .returning({ title: wikiPages.draftTitle });
  if (!page) return error("That wiki page was already deleted.");
  await db
    .update(wikiMedia)
    .set({ orphanedAt: new Date(), updatedAt: new Date() })
    .where(eq(wikiMedia.pageId, id.data));
  await logActivity({
    actorId: user.id,
    entityType: "wiki_page",
    entityId: id.data,
    action: "trashed",
    summary: `Moved wiki page “${page.title}” to trash`,
  });
  revalidatePath("/wiki");
  return { ok: true };
}

export async function restoreWikiPage(pageId: string): Promise<ActionResult> {
  const { user } = await requireRole("manager");
  const id = uuidSchema.safeParse(pageId);
  if (!id.success) return error("Page identifier is invalid.");
  const [page] = await db
    .update(wikiPages)
    .set({ deletedAt: null, updatedBy: user.id, updatedAt: new Date() })
    .where(eq(wikiPages.id, id.data))
    .returning({ id: wikiPages.id });
  if (!page) return error("That wiki page no longer exists.");
  await db
    .update(wikiMedia)
    .set({ orphanedAt: null, updatedAt: new Date() })
    .where(eq(wikiMedia.pageId, id.data));
  revalidatePath("/wiki");
  return { ok: true };
}

export async function markWikiVideoNoSpeech(mediaId: string): Promise<ActionResult> {
  const { user } = await requireRole("manager");
  const id = uuidSchema.safeParse(mediaId);
  if (!id.success) return error("Video identifier is invalid.");
  const [media] = await db
    .update(wikiMedia)
    .set({ captionStatus: "not_needed", updatedAt: new Date() })
    .where(
      and(
        eq(wikiMedia.id, id.data),
        eq(wikiMedia.kind, "video"),
        eq(wikiMedia.status, "ready")
      )
    )
    .returning({ pageId: wikiMedia.pageId });
  if (!media) return error("That wiki video no longer exists.");
  await logActivity({
    actorId: user.id,
    entityType: "wiki_media",
    entityId: id.data,
    action: "caption_exempted",
    summary: "Marked a wiki video as having no spoken audio",
  });
  revalidatePath("/wiki");
  return { ok: true };
}
