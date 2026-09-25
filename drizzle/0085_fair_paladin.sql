CREATE TYPE "public"."email_project_suggestion_status" AS ENUM('pending', 'created', 'dismissed');--> statement-breakpoint
CREATE TABLE "email_project_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"title" text NOT NULL,
	"kind" "project_kind" DEFAULT 'other' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"confidence" numeric DEFAULT '0' NOT NULL,
	"status" "email_project_suggestion_status" DEFAULT 'pending' NOT NULL,
	"created_project_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_thread_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"linked_manually" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_project_suggestions" ADD CONSTRAINT "email_project_suggestions_thread_id_email_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."email_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_project_suggestions" ADD CONSTRAINT "email_project_suggestions_created_project_id_projects_id_fk" FOREIGN KEY ("created_project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_thread_projects" ADD CONSTRAINT "email_thread_projects_thread_id_email_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."email_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_thread_projects" ADD CONSTRAINT "email_thread_projects_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_project_suggestions_thread_idx" ON "email_project_suggestions" USING btree ("thread_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "email_thread_projects_pair_idx" ON "email_thread_projects" USING btree ("thread_id","project_id");--> statement-breakpoint
CREATE INDEX "email_thread_projects_project_idx" ON "email_thread_projects" USING btree ("project_id");--> statement-breakpoint
-- Backfill: seed the join table from each thread's existing primary project link.
INSERT INTO "email_thread_projects" ("thread_id", "project_id", "linked_manually", "created_at")
SELECT "id", "project_id", "linked_manually", "created_at" FROM "email_threads" WHERE "project_id" IS NOT NULL
ON CONFLICT DO NOTHING;