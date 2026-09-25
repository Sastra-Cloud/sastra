CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "wiki_search_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"chunker_version" integer NOT NULL,
	"subject_title" text NOT NULL,
	"subject_slug" text NOT NULL,
	"page_slug" text NOT NULL,
	"page_title" text NOT NULL,
	"summary" text,
	"section" text,
	"anchor" text,
	"content" text NOT NULL,
	"search_text" text NOT NULL,
	"embedding_text" text NOT NULL,
	"contains_video" boolean DEFAULT false NOT NULL,
	"embedding" vector(1024),
	"embedding_model" text,
	"embedding_status" text DEFAULT 'pending' NOT NULL,
	"embedding_attempts" integer DEFAULT 0 NOT NULL,
	"next_embedding_attempt_at" timestamp,
	"embedding_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wiki_search_chunks" ADD CONSTRAINT "wiki_search_chunks_page_id_wiki_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."wiki_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_search_chunks" ADD CONSTRAINT "wiki_search_chunks_revision_id_wiki_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."wiki_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "wiki_search_chunks_revision_index_uq" ON "wiki_search_chunks" USING btree ("revision_id","chunk_index");--> statement-breakpoint
CREATE INDEX "wiki_search_chunks_page_revision_idx" ON "wiki_search_chunks" USING btree ("page_id","revision_id");--> statement-breakpoint
CREATE INDEX "wiki_search_chunks_embedding_queue_idx" ON "wiki_search_chunks" USING btree ("embedding_status","next_embedding_attempt_at");--> statement-breakpoint
CREATE INDEX "wiki_search_chunks_fts_idx" ON "wiki_search_chunks" USING gin (to_tsvector('simple', "search_text"));--> statement-breakpoint
CREATE INDEX "wiki_search_chunks_embedding_hnsw_idx" ON "wiki_search_chunks" USING hnsw ("embedding" vector_cosine_ops) WHERE "wiki_search_chunks"."embedding" is not null;
