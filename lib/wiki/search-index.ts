import "server-only";

import {
  and,
  cosineDistance,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  notExists,
  or,
  sql,
} from "drizzle-orm";

import {
  aiEmbed,
  WIKI_EMBEDDING_MODEL,
} from "@/lib/ai/openrouter";
import { recordUsage } from "@/lib/assistant/budget";
import { db } from "@/lib/db";
import {
  wikiPages,
  wikiRevisions,
  wikiSearchChunks,
  wikiSubjects,
  type WikiDocument,
} from "@/lib/db/schema";
import {
  buildWikiSearchChunks,
  WIKI_CHUNKER_VERSION,
} from "./search-chunks";

const EMBEDDING_BATCH_SIZE = 32;
const PROCESSING_TIMEOUT_MS = 15 * 60_000;
const QUERY_CACHE_TTL_MS = 5 * 60_000;
const QUERY_CACHE_MAX = 100;
const RRF_K = 60;
const MIN_SEMANTIC_SIMILARITY = 0.5;

type PublishedRevision = {
  pageId: string;
  revisionId: string;
  subjectTitle: string;
  subjectSlug: string;
  pageSlug: string;
  pageTitle: string;
  summary: string | null;
  content: WikiDocument;
};

export type AssistantWikiSearchResult = {
  title: string;
  subject: string;
  section: string | null;
  excerpt: string;
  href: string;
  publishedAt: string;
  containsVideo: boolean;
};

type RetrievalCandidate = AssistantWikiSearchResult & {
  id: string;
  similarity?: number;
};

function chunkValues(revision: PublishedRevision) {
  return buildWikiSearchChunks({
    subjectTitle: revision.subjectTitle,
    subjectSlug: revision.subjectSlug,
    pageSlug: revision.pageSlug,
    pageTitle: revision.pageTitle,
    summary: revision.summary,
    document: revision.content,
  }).map((chunk) => ({
    pageId: revision.pageId,
    revisionId: revision.revisionId,
    chunkIndex: chunk.chunkIndex,
    chunkerVersion: WIKI_CHUNKER_VERSION,
    subjectTitle: revision.subjectTitle,
    subjectSlug: revision.subjectSlug,
    pageSlug: revision.pageSlug,
    pageTitle: revision.pageTitle,
    summary: revision.summary,
    section: chunk.section,
    anchor: chunk.anchor,
    content: chunk.content,
    searchText: chunk.searchText,
    embeddingText: chunk.embeddingText,
    containsVideo: chunk.containsVideo,
  }));
}

async function replacePublishedRevision(revision: PublishedRevision): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ revisionId: wikiPages.publishedRevisionId })
      .from(wikiPages)
      .where(and(eq(wikiPages.id, revision.pageId), isNull(wikiPages.deletedAt)))
      .limit(1);
    if (current?.revisionId !== revision.revisionId) return false;
    await tx
      .delete(wikiSearchChunks)
      .where(eq(wikiSearchChunks.pageId, revision.pageId));
    await tx.insert(wikiSearchChunks).values(chunkValues(revision));
    return true;
  });
}

/** Backfill pages published before the search index existed, or after a chunker upgrade. */
export async function backfillPublishedWikiSearchIndex(limit = 20): Promise<number> {
  const missing = await db
    .select({
      pageId: wikiPages.id,
      revisionId: wikiRevisions.id,
      subjectTitle: wikiSubjects.title,
      subjectSlug: wikiSubjects.slug,
      pageSlug: wikiPages.slug,
      pageTitle: wikiRevisions.title,
      summary: wikiRevisions.summary,
      content: wikiRevisions.content,
    })
    .from(wikiPages)
    .innerJoin(wikiSubjects, eq(wikiSubjects.id, wikiPages.subjectId))
    .innerJoin(wikiRevisions, eq(wikiRevisions.id, wikiPages.publishedRevisionId))
    .where(
      and(
        isNull(wikiPages.deletedAt),
        isNull(wikiSubjects.deletedAt),
        notExists(
          db
            .select({ value: sql`1` })
            .from(wikiSearchChunks)
            .where(
              and(
                eq(wikiSearchChunks.revisionId, wikiRevisions.id),
                eq(wikiSearchChunks.chunkerVersion, WIKI_CHUNKER_VERSION)
              )
            )
        )
      )
    )
    .limit(limit);

  let rebuilt = 0;
  for (const revision of missing) {
    if (await replacePublishedRevision(revision)) rebuilt += 1;
  }
  return rebuilt;
}

function retryAt(attempt: number): Date {
  const delay = Math.min(24 * 60 * 60_000, 60_000 * 2 ** Math.min(attempt, 10));
  return new Date(Date.now() + delay);
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Embedding request failed.";
  return message.replace(/\s+/g, " ").slice(0, 500);
}

async function claimEmbeddingBatch(revisionId?: string) {
  const now = new Date();
  const staleProcessing = new Date(Date.now() - PROCESSING_TIMEOUT_MS);
  await db
    .update(wikiSearchChunks)
    .set({
      embeddingStatus: "failed",
      nextEmbeddingAttemptAt: now,
      embeddingError: "Embedding worker timed out; retrying.",
      updatedAt: now,
    })
    .where(
      and(
        eq(wikiSearchChunks.embeddingStatus, "processing"),
        lt(wikiSearchChunks.updatedAt, staleProcessing)
      )
    );
  await db
    .update(wikiSearchChunks)
    .set({
      embedding: null,
      embeddingModel: null,
      embeddingStatus: "pending",
      nextEmbeddingAttemptAt: null,
      embeddingError: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(wikiSearchChunks.embeddingStatus, "ready"),
        or(
          isNull(wikiSearchChunks.embeddingModel),
          ne(wikiSearchChunks.embeddingModel, WIKI_EMBEDDING_MODEL)
        )
      )
    );

  const candidates = await db
    .select({
      id: wikiSearchChunks.id,
      revisionId: wikiSearchChunks.revisionId,
      embeddingText: wikiSearchChunks.embeddingText,
      embeddingAttempts: wikiSearchChunks.embeddingAttempts,
    })
    .from(wikiSearchChunks)
    .innerJoin(
      wikiPages,
      and(
        eq(wikiPages.id, wikiSearchChunks.pageId),
        eq(wikiPages.publishedRevisionId, wikiSearchChunks.revisionId)
      )
    )
    .innerJoin(wikiSubjects, eq(wikiSubjects.id, wikiPages.subjectId))
    .where(
      and(
        isNull(wikiPages.deletedAt),
        isNull(wikiSubjects.deletedAt),
        revisionId ? eq(wikiSearchChunks.revisionId, revisionId) : undefined,
        inArray(wikiSearchChunks.embeddingStatus, ["pending", "failed"]),
        or(
          isNull(wikiSearchChunks.nextEmbeddingAttemptAt),
          lte(wikiSearchChunks.nextEmbeddingAttemptAt, now)
        )
      )
    )
    .limit(EMBEDDING_BATCH_SIZE);
  if (candidates.length === 0) return [];

  return db
    .update(wikiSearchChunks)
    .set({ embeddingStatus: "processing", updatedAt: now })
    .where(
      and(
        inArray(
          wikiSearchChunks.id,
          candidates.map((candidate) => candidate.id)
        ),
        inArray(wikiSearchChunks.embeddingStatus, ["pending", "failed"])
      )
    )
    .returning({
      id: wikiSearchChunks.id,
      revisionId: wikiSearchChunks.revisionId,
      embeddingText: wikiSearchChunks.embeddingText,
      embeddingAttempts: wikiSearchChunks.embeddingAttempts,
    });
}

async function embedClaimedChunks(revisionId?: string): Promise<number> {
  const chunks = await claimEmbeddingBatch(revisionId);
  if (chunks.length === 0) return 0;
  try {
    const result = await aiEmbed(
      chunks.map((chunk) => chunk.embeddingText),
      {
        metering: {
          scope: "workspace",
          feature: "wiki",
          operation: "embed_chunks",
          taskKey: "wiki_embedding",
          entityType: "wiki_revision",
          entityId: revisionId ?? null,
          metadata: { chunkCount: chunks.length },
        },
      }
    );
    await Promise.all(
      chunks.map((chunk, index) =>
        db
          .update(wikiSearchChunks)
          .set({
            embedding: result.embeddings[index],
            embeddingModel: WIKI_EMBEDDING_MODEL,
            embeddingStatus: "ready",
            embeddingAttempts: chunk.embeddingAttempts + 1,
            nextEmbeddingAttemptAt: null,
            embeddingError: null,
            updatedAt: new Date(),
          })
          .where(eq(wikiSearchChunks.id, chunk.id))
      )
    );
    return chunks.length;
  } catch (error) {
    await Promise.all(
      chunks.map((chunk) => {
        const attempt = chunk.embeddingAttempts + 1;
        return db
          .update(wikiSearchChunks)
          .set({
            embeddingStatus: "failed",
            embeddingAttempts: attempt,
            nextEmbeddingAttemptAt: retryAt(attempt),
            embeddingError: safeError(error),
            updatedAt: new Date(),
          })
          .where(eq(wikiSearchChunks.id, chunk.id));
      })
    );
    throw error;
  }
}

/** Best-effort immediate indexing called after a publish response. */
export async function embedWikiRevision(revisionId: string): Promise<number> {
  return embedClaimedChunks(revisionId);
}

export async function runWikiSearchIndex(): Promise<{
  rebuiltPages: number;
  embeddedChunks: number;
}> {
  const rebuiltPages = await backfillPublishedWikiSearchIndex();
  const embeddedChunks = await embedClaimedChunks();
  return { rebuiltPages, embeddedChunks };
}

const queryEmbeddingCache = new Map<
  string,
  { embedding: number[]; expiresAt: number }
>();

async function queryEmbedding(query: string, userId: string): Promise<number[]> {
  const key = query.toLocaleLowerCase();
  const cached = queryEmbeddingCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.embedding;
  if (cached) queryEmbeddingCache.delete(key);

  const result = await aiEmbed(
    [`Instruct: Retrieve the most relevant internal tutorial or process.\nQuery: ${query}`],
    {
      metering: {
        scope: "member",
        feature: "assistant",
        operation: "wiki_query_embedding",
        taskKey: "wiki_embedding",
        userId,
        actorUserId: userId,
      },
    }
  );
  await recordUsage({
    userId,
    model: result.model,
    promptTokens: result.usage.promptTokens,
    completionTokens: 0,
    costUsd: result.usage.costUsd,
  });
  if (queryEmbeddingCache.size >= QUERY_CACHE_MAX) {
    const oldest = queryEmbeddingCache.keys().next().value;
    if (oldest) queryEmbeddingCache.delete(oldest);
  }
  queryEmbeddingCache.set(key, {
    embedding: result.embeddings[0],
    expiresAt: Date.now() + QUERY_CACHE_TTL_MS,
  });
  return result.embeddings[0];
}

function excerpt(content: string): string {
  const clean = content.replace(/\s+/g, " ").trim();
  return clean.length <= 900 ? clean : `${clean.slice(0, 897).trimEnd()}…`;
}

function href(subjectSlug: string, pageSlug: string, anchor: string | null): string {
  const base = `/wiki/${subjectSlug}/${pageSlug}`;
  return anchor ? `${base}#${anchor}` : base;
}

function candidateFromRow(row: {
  id: string;
  pageTitle: string;
  subjectTitle: string;
  subjectSlug: string;
  pageSlug: string;
  section: string | null;
  anchor: string | null;
  content: string;
  containsVideo: boolean;
  publishedAt: Date;
  similarity?: number;
}): RetrievalCandidate {
  return {
    id: row.id,
    title: row.pageTitle,
    subject: row.subjectTitle,
    section: row.section,
    excerpt: excerpt(row.content),
    href: href(row.subjectSlug, row.pageSlug, row.anchor),
    publishedAt: row.publishedAt.toISOString(),
    containsVideo: row.containsVideo,
    similarity: row.similarity,
  };
}

/** Published-only hybrid Wiki retrieval for the assistant. */
export async function searchPublishedWikiForAssistant(
  rawQuery: string,
  userId: string
): Promise<AssistantWikiSearchResult[]> {
  const query = rawQuery.trim().slice(0, 240);
  if (query.length < 2) return [];
  const like = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
  const tsQuery = sql`websearch_to_tsquery('simple', ${query})`;
  const lexicalRank = sql<number>`
    ts_rank_cd(to_tsvector('simple', ${wikiSearchChunks.searchText}), ${tsQuery})
    + case when ${wikiSearchChunks.pageTitle} ilike ${like} then 1 else 0 end
    + case when ${wikiSearchChunks.subjectTitle} ilike ${like} then 0.5 else 0 end
    + case when ${wikiSearchChunks.section} ilike ${like} then 0.35 else 0 end
  `;
  const baseFields = {
    id: wikiSearchChunks.id,
    pageTitle: wikiSearchChunks.pageTitle,
    subjectTitle: wikiSearchChunks.subjectTitle,
    subjectSlug: wikiSearchChunks.subjectSlug,
    pageSlug: wikiSearchChunks.pageSlug,
    section: wikiSearchChunks.section,
    anchor: wikiSearchChunks.anchor,
    content: wikiSearchChunks.content,
    containsVideo: wikiSearchChunks.containsVideo,
    publishedAt: wikiRevisions.createdAt,
  };
  const lexicalRows = await db
    .select({ ...baseFields, rank: lexicalRank })
    .from(wikiSearchChunks)
    .innerJoin(
      wikiPages,
      and(
        eq(wikiPages.id, wikiSearchChunks.pageId),
        eq(wikiPages.publishedRevisionId, wikiSearchChunks.revisionId)
      )
    )
    .innerJoin(wikiSubjects, eq(wikiSubjects.id, wikiPages.subjectId))
    .innerJoin(wikiRevisions, eq(wikiRevisions.id, wikiSearchChunks.revisionId))
    .where(
      and(
        isNull(wikiPages.deletedAt),
        isNull(wikiSubjects.deletedAt),
        or(
          sql`to_tsvector('simple', ${wikiSearchChunks.searchText}) @@ ${tsQuery}`,
          ilike(wikiSearchChunks.searchText, like)
        )
      )
    )
    .orderBy(sql`${lexicalRank} desc`)
    .limit(20);

  let semanticRows: Array<ReturnType<typeof candidateFromRow>> = [];
  try {
    const embedding = await queryEmbedding(query, userId);
    const distance = cosineDistance(wikiSearchChunks.embedding, embedding);
    const rows = await db
      .select({
        ...baseFields,
        similarity: sql<number>`1 - (${distance})`,
      })
      .from(wikiSearchChunks)
      .innerJoin(
        wikiPages,
        and(
          eq(wikiPages.id, wikiSearchChunks.pageId),
          eq(wikiPages.publishedRevisionId, wikiSearchChunks.revisionId)
        )
      )
      .innerJoin(wikiSubjects, eq(wikiSubjects.id, wikiPages.subjectId))
      .innerJoin(wikiRevisions, eq(wikiRevisions.id, wikiSearchChunks.revisionId))
      .where(
        and(
          isNull(wikiPages.deletedAt),
          isNull(wikiSubjects.deletedAt),
          isNotNull(wikiSearchChunks.embedding),
          eq(wikiSearchChunks.embeddingStatus, "ready"),
          eq(wikiSearchChunks.embeddingModel, WIKI_EMBEDDING_MODEL),
          lte(distance, 1 - MIN_SEMANTIC_SIMILARITY)
        )
      )
      .orderBy(distance)
      .limit(20);
    semanticRows = rows.map(candidateFromRow);
  } catch (error) {
    console.warn("Wiki semantic search unavailable; using lexical results:", safeError(error));
  }

  const lexical = lexicalRows.map(candidateFromRow);
  const fused = new Map<string, { candidate: RetrievalCandidate; score: number }>();
  const addRanked = (rows: RetrievalCandidate[]) => {
    rows.forEach((candidate, index) => {
      const current = fused.get(candidate.id);
      const score = 1 / (RRF_K + index + 1);
      fused.set(candidate.id, {
        candidate: current?.candidate ?? candidate,
        score: (current?.score ?? 0) + score,
      });
    });
  };
  addRanked(lexical);
  addRanked(semanticRows);

  const seenHrefs = new Set<string>();
  return [...fused.values()]
    .sort((a, b) => b.score - a.score)
    .map(({ candidate }) => candidate)
    .filter((candidate) => {
      if (seenHrefs.has(candidate.href)) return false;
      seenHrefs.add(candidate.href);
      return true;
    })
    .slice(0, 4)
    .map((candidate) => ({
      title: candidate.title,
      subject: candidate.subject,
      section: candidate.section,
      excerpt: candidate.excerpt,
      href: candidate.href,
      publishedAt: candidate.publishedAt,
      containsVideo: candidate.containsVideo,
    }));
}
