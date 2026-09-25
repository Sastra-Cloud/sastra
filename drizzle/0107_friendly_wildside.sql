CREATE TABLE "email_project_update_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"suggested_body" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"status" "email_project_suggestion_status" DEFAULT 'pending' NOT NULL,
	"created_update_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_project_update_suggestions" ADD CONSTRAINT "email_project_update_suggestions_thread_id_email_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."email_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_project_update_suggestions" ADD CONSTRAINT "email_project_update_suggestions_message_id_email_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."email_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_project_update_suggestions" ADD CONSTRAINT "email_project_update_suggestions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_project_update_suggestions" ADD CONSTRAINT "email_project_update_suggestions_created_update_id_project_updates_id_fk" FOREIGN KEY ("created_update_id") REFERENCES "public"."project_updates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_project_update_suggestions_message_project_uq" ON "email_project_update_suggestions" USING btree ("message_id","project_id");--> statement-breakpoint
CREATE INDEX "email_project_update_suggestions_thread_status_idx" ON "email_project_update_suggestions" USING btree ("thread_id","status");