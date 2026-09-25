CREATE TABLE "wiki_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"r2_key" text,
	"original_name" text,
	"mime_type" text,
	"size_bytes" bigint DEFAULT 0 NOT NULL,
	"width" integer,
	"height" integer,
	"stream_uid" text,
	"duration_seconds" integer,
	"caption_status" text DEFAULT 'not_requested' NOT NULL,
	"spoken_language" text,
	"error_message" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"orphaned_at" timestamp,
	CONSTRAINT "wiki_media_r2_key_unique" UNIQUE("r2_key"),
	CONSTRAINT "wiki_media_stream_uid_unique" UNIQUE("stream_uid")
);
--> statement-breakpoint
CREATE TABLE "wiki_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"draft_title" text NOT NULL,
	"draft_summary" text,
	"draft_content" jsonb DEFAULT '{"type":"doc","content":[]}'::jsonb NOT NULL,
	"draft_search_text" text DEFAULT '' NOT NULL,
	"draft_version" integer DEFAULT 1 NOT NULL,
	"published_draft_version" integer DEFAULT 0 NOT NULL,
	"published_revision_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"published_at" timestamp,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "wiki_revision_media" (
	"revision_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	CONSTRAINT "wiki_revision_media_revision_id_media_id_pk" PRIMARY KEY("revision_id","media_id")
);
--> statement-breakpoint
CREATE TABLE "wiki_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"content" jsonb NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"published_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wiki_subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "wiki_media" ADD CONSTRAINT "wiki_media_page_id_wiki_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."wiki_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_media" ADD CONSTRAINT "wiki_media_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_pages" ADD CONSTRAINT "wiki_pages_subject_id_wiki_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."wiki_subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_pages" ADD CONSTRAINT "wiki_pages_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_pages" ADD CONSTRAINT "wiki_pages_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_revision_media" ADD CONSTRAINT "wiki_revision_media_revision_id_wiki_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."wiki_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_revision_media" ADD CONSTRAINT "wiki_revision_media_media_id_wiki_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."wiki_media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_revisions" ADD CONSTRAINT "wiki_revisions_page_id_wiki_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."wiki_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_revisions" ADD CONSTRAINT "wiki_revisions_published_by_user_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_subjects" ADD CONSTRAINT "wiki_subjects_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_subjects" ADD CONSTRAINT "wiki_subjects_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wiki_media_page_idx" ON "wiki_media" USING btree ("page_id","created_at");--> statement-breakpoint
CREATE INDEX "wiki_media_cleanup_idx" ON "wiki_media" USING btree ("status","orphaned_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "wiki_pages_subject_slug_uq" ON "wiki_pages" USING btree ("subject_id","slug");--> statement-breakpoint
CREATE INDEX "wiki_pages_subject_order_idx" ON "wiki_pages" USING btree ("subject_id","deleted_at","sort_order");--> statement-breakpoint
CREATE INDEX "wiki_pages_published_idx" ON "wiki_pages" USING btree ("published_revision_id","deleted_at");--> statement-breakpoint
CREATE INDEX "wiki_revision_media_media_idx" ON "wiki_revision_media" USING btree ("media_id","revision_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wiki_revisions_page_number_uq" ON "wiki_revisions" USING btree ("page_id","revision_number");--> statement-breakpoint
CREATE INDEX "wiki_revisions_page_created_idx" ON "wiki_revisions" USING btree ("page_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "wiki_subjects_slug_uq" ON "wiki_subjects" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "wiki_subjects_order_idx" ON "wiki_subjects" USING btree ("deleted_at","sort_order");