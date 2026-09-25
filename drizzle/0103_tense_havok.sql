ALTER TYPE "public"."attach_target" ADD VALUE 'license_fee_payment' BEFORE 'agreement_group';--> statement-breakpoint
CREATE TABLE "email_rights_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"attachment_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"kind" text,
	"proposal" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"model" text,
	"error" text,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_rights_reviews" ADD CONSTRAINT "email_rights_reviews_thread_id_email_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."email_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_rights_reviews" ADD CONSTRAINT "email_rights_reviews_message_id_email_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."email_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_rights_reviews" ADD CONSTRAINT "email_rights_reviews_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_rights_reviews" ADD CONSTRAINT "email_rights_reviews_attachment_id_file_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."file_attachments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_rights_reviews" ADD CONSTRAINT "email_rights_reviews_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_rights_reviews" ADD CONSTRAINT "email_rights_reviews_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_rights_reviews_attachment_project_uq" ON "email_rights_reviews" USING btree ("attachment_id","project_id");--> statement-breakpoint
CREATE INDEX "email_rights_reviews_thread_status_idx" ON "email_rights_reviews" USING btree ("thread_id","status");--> statement-breakpoint
CREATE INDEX "email_rights_reviews_queue_idx" ON "email_rights_reviews" USING btree ("status","updated_at");