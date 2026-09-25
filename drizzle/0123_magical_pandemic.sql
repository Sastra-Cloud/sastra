ALTER TYPE "public"."email_task_feedback_signal" ADD VALUE 'already_done' BEFORE 'undone';--> statement-breakpoint
ALTER TABLE "email_task_suggestions" ADD COLUMN "source_email_date" date;