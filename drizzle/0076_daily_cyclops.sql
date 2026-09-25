ALTER TABLE "workspace_settings" ADD COLUMN "default_plan_template_key" text;
--> statement-breakpoint
UPDATE "workspace_settings"
SET "default_plan_template_key" = 'book-translation'
WHERE "setup_completed_at" IS NOT NULL;
