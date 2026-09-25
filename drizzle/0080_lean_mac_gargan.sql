ALTER TABLE "workspace_settings" ADD COLUMN "projects_concurrent" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "duration_months_book" integer DEFAULT 18 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "duration_months_article" integer DEFAULT 8 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "duration_months_podcast" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "duration_months_other" integer DEFAULT 12 NOT NULL;