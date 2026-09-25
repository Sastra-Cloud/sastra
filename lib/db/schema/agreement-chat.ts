import { sql } from "drizzle-orm";
import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { fileAttachments, files } from "./files";
import { projects } from "./projects";
import { rightsItems } from "./rights";

export type AgreementDocumentStatus =
  | "pending"
  | "processing"
  | "ready"
  | "failed"
  | "unsupported";

export type AgreementCitationSnapshot = {
  chunkId: string;
  documentId: string;
  fileId: string;
  attachmentId: string;
  documentName: string;
  label: "mou" | "license";
  section: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  quote: string;
  passage: string;
};

/**
 * Rebuildable, private index of a direct MoU/license attachment. The polymorphic
 * attachment is a real row, so using it as the parent makes removal immediately
 * cascade through the derived document and chunks without touching chat history.
 */
export const agreementDocuments = pgTable(
  "agreement_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    rightsItemId: uuid("rights_item_id")
      .notNull()
      .references(() => rightsItems.id, { onDelete: "cascade" }),
    attachmentId: uuid("attachment_id")
      .notNull()
      .references(() => fileAttachments.id, { onDelete: "cascade" }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    label: text("label").$type<"mou" | "license">().notNull(),
    sourceOrder: integer("source_order").notNull().default(0),
    status: text("status")
      .$type<AgreementDocumentStatus>()
      .notNull()
      .default("pending"),
    indexStatus: text("index_status")
      .$type<"pending" | "processing" | "ready" | "failed">()
      .notNull()
      .default("pending"),
    parser: text("parser"),
    parserVersion: integer("parser_version").notNull().default(1),
    indexVersion: integer("index_version").notNull().default(1),
    embeddingVersion: integer("embedding_version").notNull().default(1),
    contentHash: text("content_hash"),
    normalizedText: text("normalized_text"),
    estimatedTokens: integer("estimated_tokens").notNull().default(0),
    pageCount: integer("page_count"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at"),
    error: text("error"),
    processingStartedAt: timestamp("processing_started_at"),
    indexedAt: timestamp("indexed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("agreement_documents_attachment_uq").on(t.attachmentId),
    index("agreement_documents_project_idx").on(t.projectId, t.sourceOrder),
    index("agreement_documents_queue_idx").on(t.status, t.nextAttemptAt),
    index("agreement_documents_index_status_idx").on(t.indexStatus, t.updatedAt),
  ]
);

/** Clause-sized, page-aware evidence rows. IDs are deterministic SHA-256 keys. */
export const agreementDocumentChunks = pgTable(
  "agreement_document_chunks",
  {
    id: text("id").primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => agreementDocuments.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    sourceOrder: integer("source_order").notNull(),
    section: text("section"),
    pageStart: integer("page_start"),
    pageEnd: integer("page_end"),
    content: text("content").notNull(),
    searchText: text("search_text").notNull(),
    embeddingText: text("embedding_text").notNull(),
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
    uniqueIndex("agreement_chunks_document_index_uq").on(
      t.documentId,
      t.chunkIndex
    ),
    index("agreement_chunks_project_order_idx").on(
      t.projectId,
      t.sourceOrder,
      t.chunkIndex
    ),
    index("agreement_chunks_embedding_queue_idx").on(
      t.embeddingStatus,
      t.nextEmbeddingAttemptAt
    ),
    index("agreement_chunks_fts_idx").using(
      "gin",
      sql`to_tsvector('simple', ${t.searchText})`
    ),
    index("agreement_chunks_embedding_hnsw_idx")
      .using("hnsw", t.embedding.op("vector_cosine_ops"))
      .where(sql`${t.embedding} is not null`),
  ]
);

/** One private agreement thread per active teammate and project. */
export const agreementChatThreads = pgTable(
  "agreement_chat_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("agreement_chat_threads_user_project_uq").on(
      t.userId,
      t.projectId
    ),
  ]
);

export const agreementChatMessages = pgTable(
  "agreement_chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => agreementChatThreads.id, { onDelete: "cascade" }),
    role: text("role").$type<"user" | "assistant">().notNull(),
    status: text("status")
      .$type<"pending" | "complete" | "failed">()
      .notNull()
      .default("complete"),
    content: text("content").notNull(),
    selectedDocumentIds: uuid("selected_document_ids").array().notNull().default([]),
    answerStatus: text("answer_status").$type<
      "answered" | "not_stated" | "ambiguous"
    >(),
    citations: jsonb("citations")
      .$type<AgreementCitationSnapshot[]>()
      .notNull()
      .default([]),
    retrievalMode: text("retrieval_mode").$type<"full" | "hybrid">(),
    model: text("model"),
    costUsd: doublePrecision("cost_usd"),
    latencyMs: integer("latency_ms"),
    citationValidation: text("citation_validation"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("agreement_chat_messages_thread_idx").on(t.threadId, t.createdAt)],
);
