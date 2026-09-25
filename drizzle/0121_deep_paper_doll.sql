ALTER TABLE "workspace_settings" ALTER COLUMN "donation_source_retention_days" SET DEFAULT 30;--> statement-breakpoint
UPDATE "workspace_settings"
SET "donation_source_retention_days" = 30
WHERE "donation_source_retention_days" IS NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ALTER COLUMN "donation_source_retention_days" SET NOT NULL;--> statement-breakpoint
UPDATE "donation_imports"
SET "source_retention_until" = "created_at" + interval '30 days'
WHERE "source_retention_until" IS NULL
  AND "source_purged_at" IS NULL
  AND "file_id" IS NOT NULL;
