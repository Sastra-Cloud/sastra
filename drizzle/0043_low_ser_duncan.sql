CREATE TABLE "print_extraction_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"run_id" uuid,
	"kind" text NOT NULL,
	"file_id" uuid,
	"source_thread_id" uuid,
	"source_message_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"quote_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "print_quotes" ADD COLUMN "review_flags" jsonb;--> statement-breakpoint
ALTER TABLE "print_quotes" ADD COLUMN "extraction_source" text;--> statement-breakpoint
ALTER TABLE "print_extraction_jobs" ADD CONSTRAINT "print_extraction_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_extraction_jobs" ADD CONSTRAINT "print_extraction_jobs_run_id_print_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."print_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_extraction_jobs" ADD CONSTRAINT "print_extraction_jobs_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_extraction_jobs" ADD CONSTRAINT "print_extraction_jobs_source_thread_id_email_threads_id_fk" FOREIGN KEY ("source_thread_id") REFERENCES "public"."email_threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_extraction_jobs" ADD CONSTRAINT "print_extraction_jobs_source_message_id_email_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."email_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_extraction_jobs" ADD CONSTRAINT "print_extraction_jobs_quote_id_print_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."print_quotes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "print_extraction_jobs_run_idx" ON "print_extraction_jobs" USING btree ("run_id","status");--> statement-breakpoint
CREATE INDEX "print_extraction_jobs_project_idx" ON "print_extraction_jobs" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "print_extraction_jobs_message_idx" ON "print_extraction_jobs" USING btree ("source_message_id");