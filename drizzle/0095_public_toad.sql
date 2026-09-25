CREATE TYPE "public"."video_production_mode" AS ENUM('original', 'translation');--> statement-breakpoint
-- Drizzle applies every pending migration in one PostgreSQL transaction. Recreate
-- this enum so the following data migration can use the new values immediately.
ALTER TYPE "public"."podcast_stage" RENAME TO "podcast_stage_old";--> statement-breakpoint
CREATE TYPE "public"."podcast_stage" AS ENUM(
  'concept_outline',
  'write_script',
  'approve_script',
  'translate_script',
  'approve_translation',
  'record_audio',
  'master_audio',
  'produce_video',
  'approve_video',
  'schedule_episode'
);--> statement-breakpoint
ALTER TABLE "tasks"
  ALTER COLUMN "podcast_stage" TYPE "public"."podcast_stage"
  USING "podcast_stage"::text::"public"."podcast_stage";--> statement-breakpoint
ALTER TABLE "podcast_stage_settings"
  ALTER COLUMN "stage" TYPE "public"."podcast_stage"
  USING "stage"::text::"public"."podcast_stage";--> statement-breakpoint
DROP TYPE "public"."podcast_stage_old";--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "video_production_mode" "video_production_mode";
