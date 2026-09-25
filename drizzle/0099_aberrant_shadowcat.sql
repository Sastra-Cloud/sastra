CREATE TYPE "public"."email_task_action_kind" AS ENUM('schedule_meeting', 'reply', 'follow_up', 'review', 'send', 'general');--> statement-breakpoint
CREATE TYPE "public"."email_task_feedback_signal" AS ENUM('accepted', 'edited', 'dismissed', 'undone');--> statement-breakpoint
CREATE TYPE "public"."email_task_rule_scope" AS ENUM('user', 'workspace');--> statement-breakpoint
CREATE TYPE "public"."email_task_rule_status" AS ENUM('candidate', 'approved', 'rejected', 'retired');--> statement-breakpoint
CREATE TYPE "public"."email_task_suggestion_mode" AS ENUM('explicit_auto', 'implicit_review');--> statement-breakpoint
CREATE TABLE "email_task_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"suggestion_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"signal" "email_task_feedback_signal" NOT NULL,
	"original_snapshot" jsonb NOT NULL,
	"final_snapshot" jsonb,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_task_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" "email_task_rule_scope" NOT NULL,
	"user_id" text,
	"rule_key" text NOT NULL,
	"explanation" text NOT NULL,
	"condition" jsonb NOT NULL,
	"effect" jsonb NOT NULL,
	"status" "email_task_rule_status" DEFAULT 'candidate' NOT NULL,
	"evidence_count" integer DEFAULT 0 NOT NULL,
	"evidence_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"approved_by" text,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_task_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"forwarder_user_id" text NOT NULL,
	"assigned_to" text NOT NULL,
	"project_id" uuid,
	"action_kind" "email_task_action_kind" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"due_date" date,
	"priority" text DEFAULT 'medium' NOT NULL,
	"primary_url" text,
	"primary_url_label" text,
	"source_subject" text,
	"source_sender" text,
	"confidence" real NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"explicit_intent_evidence" text,
	"mode" "email_task_suggestion_mode" NOT NULL,
	"candidate_key" text NOT NULL,
	"status" "email_project_suggestion_status" DEFAULT 'pending' NOT NULL,
	"created_task_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_preferences" ADD COLUMN "email_task_suggestions_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "email_preferences" ADD COLUMN "email_task_learning_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "email_messages" ADD COLUMN "forwarded_by_user_id" text;--> statement-breakpoint
ALTER TABLE "email_messages" ADD COLUMN "forwarder_note" text;--> statement-breakpoint
ALTER TABLE "email_task_feedback" ADD CONSTRAINT "email_task_feedback_suggestion_id_email_task_suggestions_id_fk" FOREIGN KEY ("suggestion_id") REFERENCES "public"."email_task_suggestions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_task_feedback" ADD CONSTRAINT "email_task_feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_task_rules" ADD CONSTRAINT "email_task_rules_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_task_rules" ADD CONSTRAINT "email_task_rules_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_task_suggestions" ADD CONSTRAINT "email_task_suggestions_thread_id_email_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."email_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_task_suggestions" ADD CONSTRAINT "email_task_suggestions_message_id_email_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."email_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_task_suggestions" ADD CONSTRAINT "email_task_suggestions_forwarder_user_id_user_id_fk" FOREIGN KEY ("forwarder_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_task_suggestions" ADD CONSTRAINT "email_task_suggestions_assigned_to_user_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_task_suggestions" ADD CONSTRAINT "email_task_suggestions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_task_suggestions" ADD CONSTRAINT "email_task_suggestions_created_task_id_tasks_id_fk" FOREIGN KEY ("created_task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_task_feedback_user_created_idx" ON "email_task_feedback" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "email_task_feedback_suggestion_idx" ON "email_task_feedback" USING btree ("suggestion_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_task_rules_scope_user_key_uq" ON "email_task_rules" USING btree ("scope","user_id","rule_key");--> statement-breakpoint
CREATE INDEX "email_task_rules_status_idx" ON "email_task_rules" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "email_task_suggestions_message_key_uq" ON "email_task_suggestions" USING btree ("message_id","candidate_key");--> statement-breakpoint
CREATE UNIQUE INDEX "email_task_suggestions_created_task_uq" ON "email_task_suggestions" USING btree ("created_task_id");--> statement-breakpoint
CREATE INDEX "email_task_suggestions_forwarder_status_idx" ON "email_task_suggestions" USING btree ("forwarder_user_id","status","created_at");--> statement-breakpoint
CREATE INDEX "email_task_suggestions_thread_status_idx" ON "email_task_suggestions" USING btree ("thread_id","status");--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_forwarded_by_user_id_user_id_fk" FOREIGN KEY ("forwarded_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;