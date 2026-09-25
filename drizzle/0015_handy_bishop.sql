ALTER TABLE "user" ADD COLUMN "weekly_hours" integer DEFAULT 40 NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "estimate_hours" numeric(6, 2);