ALTER TABLE "workspace_settings" ALTER COLUMN "org_name" SET DEFAULT 'Action International';--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "org_aliases" text[] DEFAULT ARRAY['ACTION Cambodia', 'Action Cambodia']::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "internal_email_domains" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
UPDATE "workspace_settings"
SET "org_name" = 'Action International'
WHERE "id" = 'workspace' AND "org_name" IS NULL;
