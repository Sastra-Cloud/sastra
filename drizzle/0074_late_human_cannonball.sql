ALTER TABLE "projects" RENAME COLUMN "khmer_title" TO "target_language_title";--> statement-breakpoint
ALTER TABLE "workspace_settings" ALTER COLUMN "org_name" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "workspace_settings" ALTER COLUMN "org_aliases" SET DEFAULT ARRAY[]::text[];--> statement-breakpoint
ALTER TABLE "workspace_settings" ALTER COLUMN "internal_email_domains" SET DEFAULT ARRAY[]::text[];--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "legal_name" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "timezone" text DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "source_language" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "target_language" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "default_territory" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "default_currency" text DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "mission_context" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "contact_email" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "contact_phone" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "address_line_1" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "address_line_2" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "address_city" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "address_region" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "address_postal_code" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "address_country" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "registration_number" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "tax_id" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "payment_instructions" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "work_days" integer[] DEFAULT ARRAY[1,2,3,4,5]::integer[] NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "work_hours_start" integer DEFAULT 480 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "work_hours_end" integer DEFAULT 960 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "weekly_digest_day" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "weekly_digest_time" text DEFAULT '09:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "words_per_page" integer DEFAULT 217 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "language_expansion_factor" numeric(5, 2) DEFAULT '1.50' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "trim_width_in" numeric(6, 2) DEFAULT '6.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "trim_height_in" numeric(6, 2) DEFAULT '9.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "default_delivery_location" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "financial_email" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "default_cc_emails" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "funding_account_label" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "rate_translation" numeric(10, 4) DEFAULT '0.03' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "rate_proofreading" numeric(10, 4) DEFAULT '0.01' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "rate_editing" numeric(10, 4) DEFAULT '0.03' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "rate_cover_design" numeric(10, 4) DEFAULT '100' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "rate_typesetting" numeric(10, 4) DEFAULT '3' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "rate_project_management" numeric(10, 4) DEFAULT '200' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "rate_print_ship" numeric(10, 4) DEFAULT '2000' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "rate_audiobook" numeric(10, 4) DEFAULT '0.01' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "rate_video_series" numeric(10, 4) DEFAULT '0.01' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "setup_completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "source_language" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "target_language" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "issuer_snapshot" jsonb;
--> statement-breakpoint
-- Preserve the current ACTION workspace while leaving brand-new installations
-- neutral. Existing ACTION users provide an unambiguous legacy signal; fresh
-- databases have no human users when migrations run.
INSERT INTO "workspace_settings" (
  "id", "org_name", "legal_name", "org_aliases", "internal_email_domains",
  "timezone", "source_language", "target_language", "default_territory",
  "default_currency", "mission_context", "financial_email",
  "default_cc_emails", "funding_account_label", "default_delivery_location",
  "setup_completed_at"
)
SELECT
  'workspace', 'Workspace', 'Workspace',
  ARRAY[]::text[],
  ARRAY[]::text[],
  'UTC', 'English', '', '', 'USD',
  '',
  'finance@example.org',
  ARRAY[]::text[],
  'Translation fund', '', now()
WHERE EXISTS (
  SELECT 1 FROM "user"
  WHERE "is_bot" = false
    AND lower(split_part("email", '@', 2)) IN ('example.org')
)
ON CONFLICT ("id") DO UPDATE SET
  "org_name" = COALESCE("workspace_settings"."org_name", EXCLUDED."org_name"),
  "legal_name" = COALESCE("workspace_settings"."legal_name", EXCLUDED."legal_name"),
  "org_aliases" = EXCLUDED."org_aliases",
  "internal_email_domains" = EXCLUDED."internal_email_domains",
  "timezone" = EXCLUDED."timezone",
  "source_language" = EXCLUDED."source_language",
  "target_language" = EXCLUDED."target_language",
  "default_territory" = EXCLUDED."default_territory",
  "default_currency" = EXCLUDED."default_currency",
  "mission_context" = COALESCE("workspace_settings"."mission_context", EXCLUDED."mission_context"),
  "financial_email" = EXCLUDED."financial_email",
  "default_cc_emails" = EXCLUDED."default_cc_emails",
  "funding_account_label" = EXCLUDED."funding_account_label",
  "default_delivery_location" = EXCLUDED."default_delivery_location",
  "setup_completed_at" = COALESCE("workspace_settings"."setup_completed_at", now());
--> statement-breakpoint
UPDATE "projects"
SET "source_language" = COALESCE("source_language", 'English'),
    "target_language" = COALESCE("target_language", 'Khmer')
WHERE EXISTS (
  SELECT 1 FROM "user"
  WHERE "is_bot" = false
    AND lower(split_part("email", '@', 2)) IN ('example.org')
);
--> statement-breakpoint
INSERT INTO "project_budget_settings" (
  "project_id", "words_per_page", "currency", "rate_translation",
  "rate_proofreading", "rate_editing", "rate_cover_design", "rate_typesetting",
  "rate_project_management", "rate_print_ship", "rate_audiobook", "rate_video_series"
)
SELECT "id", 217, 'USD', 0.03, 0.01, 0.03, 100, 3, 200, 2000, 0.01, 0.01
FROM "projects"
WHERE EXISTS (
  SELECT 1 FROM "user"
  WHERE "is_bot" = false
    AND lower(split_part("email", '@', 2)) IN ('example.org')
)
ON CONFLICT ("project_id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "project_print_settings" (
  "project_id", "trim_width_in", "trim_height_in", "language_expansion_factor",
  "financial_email", "cc_emails"
)
SELECT "id", 6.00, 9.00, 1.50, 'finance@example.org',
  ARRAY[]::text[]
FROM "projects"
WHERE EXISTS (
  SELECT 1 FROM "user"
  WHERE "is_bot" = false
    AND lower(split_part("email", '@', 2)) IN ('example.org')
)
ON CONFLICT ("project_id") DO NOTHING;
--> statement-breakpoint
UPDATE "invoices" i
SET "issuer_snapshot" = jsonb_build_object(
  'orgName', w."org_name",
  'legalName', w."legal_name",
  'logoFileId', w."logo_file_id",
  'accentColor', w."accent_color",
  'contactEmail', w."contact_email",
  'contactPhone', w."contact_phone",
  'address', ARRAY_REMOVE(ARRAY[
    w."address_line_1", w."address_line_2", w."address_city",
    w."address_region", w."address_postal_code", w."address_country"
  ], NULL),
  'registrationNumber', w."registration_number",
  'taxId', w."tax_id",
  'paymentInstructions', w."payment_instructions"
)
FROM "workspace_settings" w
WHERE w."id" = 'workspace' AND i."issuer_snapshot" IS NULL;
