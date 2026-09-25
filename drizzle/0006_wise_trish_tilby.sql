CREATE TYPE "public"."draft_status" AS ENUM('interviewing', 'ready', 'committed', 'discarded');--> statement-breakpoint
CREATE TABLE "ai_plan_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"created_by" text,
	"status" "draft_status" DEFAULT 'interviewing' NOT NULL,
	"conversation" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"proposed_plan" jsonb,
	"model" text,
	"committed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_task_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_key" text NOT NULL,
	"model" text NOT NULL,
	"fallback_models" text[],
	"temperature" double precision,
	"updated_by" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ai_task_models_task_key_unique" UNIQUE("task_key")
);
--> statement-breakpoint
ALTER TABLE "ai_plan_drafts" ADD CONSTRAINT "ai_plan_drafts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_plan_drafts" ADD CONSTRAINT "ai_plan_drafts_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_task_models" ADD CONSTRAINT "ai_task_models_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;