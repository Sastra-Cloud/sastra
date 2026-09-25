ALTER TABLE "user" ALTER COLUMN "timezone" SET DEFAULT 'UTC';--> statement-breakpoint
ALTER TABLE "standups" ALTER COLUMN "timezone" SET DEFAULT 'UTC';--> statement-breakpoint
ALTER TABLE "print_runs" ALTER COLUMN "delivery_location" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "project_print_settings" ALTER COLUMN "financial_email" SET DEFAULT '';