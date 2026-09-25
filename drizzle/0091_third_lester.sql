CREATE TABLE "agreement_chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'complete' NOT NULL,
	"content" text NOT NULL,
	"selected_document_ids" uuid[] DEFAULT '{}' NOT NULL,
	"answer_status" text,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"retrieval_mode" text,
	"model" text,
	"cost_usd" double precision,
	"latency_ms" integer,
	"citation_validation" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agreement_chat_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agreement_document_chunks" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"source_order" integer NOT NULL,
	"section" text,
	"page_start" integer,
	"page_end" integer,
	"content" text NOT NULL,
	"search_text" text NOT NULL,
	"embedding_text" text NOT NULL,
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
CREATE TABLE "agreement_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"rights_item_id" uuid NOT NULL,
	"attachment_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"label" text NOT NULL,
	"source_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"parser" text,
	"parser_version" integer DEFAULT 1 NOT NULL,
	"index_version" integer DEFAULT 1 NOT NULL,
	"content_hash" text,
	"normalized_text" text,
	"estimated_tokens" integer DEFAULT 0 NOT NULL,
	"page_count" integer,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp,
	"error" text,
	"processing_started_at" timestamp,
	"indexed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agreement_chat_messages" ADD CONSTRAINT "agreement_chat_messages_thread_id_agreement_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."agreement_chat_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_chat_threads" ADD CONSTRAINT "agreement_chat_threads_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_chat_threads" ADD CONSTRAINT "agreement_chat_threads_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_document_chunks" ADD CONSTRAINT "agreement_document_chunks_document_id_agreement_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."agreement_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_document_chunks" ADD CONSTRAINT "agreement_document_chunks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_documents" ADD CONSTRAINT "agreement_documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_documents" ADD CONSTRAINT "agreement_documents_rights_item_id_rights_items_id_fk" FOREIGN KEY ("rights_item_id") REFERENCES "public"."rights_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_documents" ADD CONSTRAINT "agreement_documents_attachment_id_file_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."file_attachments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_documents" ADD CONSTRAINT "agreement_documents_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agreement_chat_messages_thread_idx" ON "agreement_chat_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agreement_chat_threads_user_project_uq" ON "agreement_chat_threads" USING btree ("user_id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agreement_chunks_document_index_uq" ON "agreement_document_chunks" USING btree ("document_id","chunk_index");--> statement-breakpoint
CREATE INDEX "agreement_chunks_project_order_idx" ON "agreement_document_chunks" USING btree ("project_id","source_order","chunk_index");--> statement-breakpoint
CREATE INDEX "agreement_chunks_embedding_queue_idx" ON "agreement_document_chunks" USING btree ("embedding_status","next_embedding_attempt_at");--> statement-breakpoint
CREATE INDEX "agreement_chunks_fts_idx" ON "agreement_document_chunks" USING gin (to_tsvector('simple', "search_text"));--> statement-breakpoint
CREATE INDEX "agreement_chunks_embedding_hnsw_idx" ON "agreement_document_chunks" USING hnsw ("embedding" vector_cosine_ops) WHERE "agreement_document_chunks"."embedding" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "agreement_documents_attachment_uq" ON "agreement_documents" USING btree ("attachment_id");--> statement-breakpoint
CREATE INDEX "agreement_documents_project_idx" ON "agreement_documents" USING btree ("project_id","source_order");--> statement-breakpoint
CREATE INDEX "agreement_documents_queue_idx" ON "agreement_documents" USING btree ("status","next_attempt_at");