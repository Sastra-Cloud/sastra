CREATE TYPE "public"."podcast_stage" AS ENUM('translate_script', 'approve_translation', 'record_audio', 'master_audio', 'produce_video', 'approve_video', 'schedule_episode');--> statement-breakpoint
CREATE TABLE "podcast_stage_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"stage" "podcast_stage" NOT NULL,
	"default_assignee_id" text,
	"days_before_publication" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "video_required" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "units" ADD COLUMN "owner_id" text;--> statement-breakpoint
ALTER TABLE "units" ADD COLUMN "video_required_override" boolean;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "podcast_stage" "podcast_stage";--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "due_date_is_manual" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "podcast_stage_settings" ADD CONSTRAINT "podcast_stage_settings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "podcast_stage_settings" ADD CONSTRAINT "podcast_stage_settings_default_assignee_id_user_id_fk" FOREIGN KEY ("default_assignee_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "podcast_stage_settings_project_stage_unique" ON "podcast_stage_settings" USING btree ("project_id","stage");--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_unit_podcast_stage_unique" ON "tasks" USING btree ("unit_id","podcast_stage") WHERE "tasks"."podcast_stage" is not null;