CREATE TABLE "proposal_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"sent_by_user_id" text,
	"recipient_name" text,
	"recipient_email" text NOT NULL,
	"cc_emails" jsonb,
	"subject" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"total_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"file_id" text,
	"email_thread_id" uuid,
	"status" text DEFAULT 'sent' NOT NULL,
	"notes" text,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "proposal_submissions" ADD CONSTRAINT "proposal_submissions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_submissions" ADD CONSTRAINT "proposal_submissions_sent_by_user_id_user_id_fk" FOREIGN KEY ("sent_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_submissions" ADD CONSTRAINT "proposal_submissions_email_thread_id_email_threads_id_fk" FOREIGN KEY ("email_thread_id") REFERENCES "public"."email_threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "proposal_submissions_project_idx" ON "proposal_submissions" USING btree ("project_id","sent_at");