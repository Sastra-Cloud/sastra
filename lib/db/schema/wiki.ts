import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

export type WikiContentNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: WikiContentNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
};

export type WikiDocument = WikiContentNode & { type: "doc" };

export const wikiSubjects = pgTable(
  "wiki_subjects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    updatedBy: text("updated_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => [
    uniqueIndex("wiki_subjects_slug_uq").on(t.slug),
    index("wiki_subjects_order_idx").on(t.deletedAt, t.sortOrder),
  ]
);

export const wikiPages = pgTable(
  "wiki_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => wikiSubjects.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    draftTitle: text("draft_title").notNull(),
    draftSummary: text("draft_summary"),
    draftContent: jsonb("draft_content")
      .$type<WikiDocument>()
      .notNull()
      .default(sql`'{"type":"doc","content":[]}'::jsonb`),
    draftSearchText: text("draft_search_text").notNull().default(""),
    draftVersion: integer("draft_version").notNull().default(1),
    publishedDraftVersion: integer("published_draft_version").notNull().default(0),
    publishedRevisionId: uuid("published_revision_id").references(
      (): AnyPgColumn => wikiRevisions.id,
      { onDelete: "set null" }
    ),
    sortOrder: integer("sort_order").notNull().default(0),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    updatedBy: text("updated_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    publishedAt: timestamp("published_at"),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => [
    uniqueIndex("wiki_pages_subject_slug_uq").on(t.subjectId, t.slug),
    index("wiki_pages_subject_order_idx").on(
      t.subjectId,
      t.deletedAt,
      t.sortOrder
    ),
    index("wiki_pages_published_idx").on(t.publishedRevisionId, t.deletedAt),
  ]
);

export const wikiRevisions = pgTable(
  "wiki_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => wikiPages.id, { onDelete: "cascade" }),
    revisionNumber: integer("revision_number").notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    content: jsonb("content").$type<WikiDocument>().notNull(),
    searchText: text("search_text").notNull().default(""),
    publishedBy: text("published_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("wiki_revisions_page_number_uq").on(
      t.pageId,
      t.revisionNumber
    ),
    index("wiki_revisions_page_created_idx").on(t.pageId, t.createdAt),
  ]
);

/**
 * Derived, rebuildable search index for the current published Wiki content.
 * Rows are revision-scoped so queries can enforce the published revision even
 * while a newer draft or superseded revision exists.
 */
export const wikiSearchChunks = pgTable(
  "wiki_search_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => wikiPages.id, { onDelete: "cascade" }),
    revisionId: uuid("revision_id")
      .notNull()
      .references(() => wikiRevisions.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    chunkerVersion: integer("chunker_version").notNull(),
    subjectTitle: text("subject_title").notNull(),
    subjectSlug: text("subject_slug").notNull(),
    pageSlug: text("page_slug").notNull(),
    pageTitle: text("page_title").notNull(),
    summary: text("summary"),
    section: text("section"),
    anchor: text("anchor"),
    content: text("content").notNull(),
    searchText: text("search_text").notNull(),
    embeddingText: text("embedding_text").notNull(),
    containsVideo: boolean("contains_video").notNull().default(false),
    embedding: vector("embedding", { dimensions: 1024 }),
    embeddingModel: text("embedding_model"),
    embeddingStatus: text("embedding_status")
      .$type<"pending" | "processing" | "ready" | "failed">()
      .notNull()
      .default("pending"),
    embeddingAttempts: integer("embedding_attempts").notNull().default(0),
    nextEmbeddingAttemptAt: timestamp("next_embedding_attempt_at"),
    embeddingError: text("embedding_error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("wiki_search_chunks_revision_index_uq").on(
      t.revisionId,
      t.chunkIndex
    ),
    index("wiki_search_chunks_page_revision_idx").on(t.pageId, t.revisionId),
    index("wiki_search_chunks_embedding_queue_idx").on(
      t.embeddingStatus,
      t.nextEmbeddingAttemptAt
    ),
    index("wiki_search_chunks_fts_idx").using(
      "gin",
      sql`to_tsvector('simple', ${t.searchText})`
    ),
    index("wiki_search_chunks_embedding_hnsw_idx")
      .using("hnsw", t.embedding.op("vector_cosine_ops"))
      .where(sql`${t.embedding} is not null`),
  ]
);

export const wikiMedia = pgTable(
  "wiki_media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => wikiPages.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"image" | "video">().notNull(),
    status: text("status")
      .$type<"pending" | "processing" | "ready" | "failed">()
      .notNull()
      .default("pending"),
    r2Key: text("r2_key").unique(),
    originalName: text("original_name"),
    mimeType: text("mime_type"),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
    width: integer("width"),
    height: integer("height"),
    durationSeconds: integer("duration_seconds"),
    captionStatus: text("caption_status")
      .$type<"not_requested" | "generating" | "ready" | "failed" | "not_needed">()
      .notNull()
      .default("not_requested"),
    spokenLanguage: text("spoken_language"),
    errorMessage: text("error_message"),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    orphanedAt: timestamp("orphaned_at"),
  },
  (t) => [
    index("wiki_media_page_idx").on(t.pageId, t.createdAt),
    index("wiki_media_cleanup_idx").on(t.status, t.orphanedAt, t.createdAt),
  ]
);

export const wikiRevisionMedia = pgTable(
  "wiki_revision_media",
  {
    revisionId: uuid("revision_id")
      .notNull()
      .references(() => wikiRevisions.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => wikiMedia.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.revisionId, t.mediaId] }),
    index("wiki_revision_media_media_idx").on(t.mediaId, t.revisionId),
  ]
);
