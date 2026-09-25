CREATE TYPE "public"."standup_run_status" AS ENUM('pending', 'in_progress', 'completed', 'missed');--> statement-breakpoint
ALTER TYPE "public"."channel_kind" ADD VALUE 'standup';--> statement-breakpoint
CREATE TABLE "standup_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"question_id" uuid,
	"content" text NOT NULL,
	"answered_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "standup_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"standup_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"timezone" text
);
--> statement-breakpoint
CREATE TABLE "standup_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"standup_id" uuid NOT NULL,
	"prompt" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "standup_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"standup_id" uuid NOT NULL,
	"run_date" date NOT NULL,
	"summary" jsonb NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "standup_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"standup_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"channel_id" uuid,
	"run_date" date NOT NULL,
	"status" "standup_run_status" DEFAULT 'in_progress' NOT NULL,
	"current_question_index" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"reminded_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "standups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"schedule_time" text DEFAULT '09:00' NOT NULL,
	"schedule_days" smallint[] DEFAULT '{1,2,3,4,5}' NOT NULL,
	"timezone" text DEFAULT 'Asia/Phnom_Penh' NOT NULL,
	"reminder_after_minutes" integer,
	"report_to_user_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "standup_answers" ADD CONSTRAINT "standup_answers_run_id_standup_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."standup_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standup_answers" ADD CONSTRAINT "standup_answers_question_id_standup_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."standup_questions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standup_participants" ADD CONSTRAINT "standup_participants_standup_id_standups_id_fk" FOREIGN KEY ("standup_id") REFERENCES "public"."standups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standup_participants" ADD CONSTRAINT "standup_participants_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standup_questions" ADD CONSTRAINT "standup_questions_standup_id_standups_id_fk" FOREIGN KEY ("standup_id") REFERENCES "public"."standups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standup_reports" ADD CONSTRAINT "standup_reports_standup_id_standups_id_fk" FOREIGN KEY ("standup_id") REFERENCES "public"."standups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standup_runs" ADD CONSTRAINT "standup_runs_standup_id_standups_id_fk" FOREIGN KEY ("standup_id") REFERENCES "public"."standups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standup_runs" ADD CONSTRAINT "standup_runs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standup_runs" ADD CONSTRAINT "standup_runs_channel_id_chat_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."chat_channels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standups" ADD CONSTRAINT "standups_report_to_user_id_user_id_fk" FOREIGN KEY ("report_to_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standups" ADD CONSTRAINT "standups_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "standup_participants_unique" ON "standup_participants" USING btree ("standup_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "standup_reports_unique" ON "standup_reports" USING btree ("standup_id","run_date");--> statement-breakpoint
CREATE UNIQUE INDEX "standup_runs_unique" ON "standup_runs" USING btree ("standup_id","user_id","run_date");