CREATE TABLE "document_learning_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow" text NOT NULL,
	"source" text NOT NULL,
	"source_ref" text NOT NULL,
	"source_name" text,
	"source_text" text,
	"prediction" jsonb,
	"corrected" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"cloud_submitted_at" timestamp,
	"submitted_rule" jsonb,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_document_library" (
	"id" text PRIMARY KEY DEFAULT 'library' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"lessons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"synced_at" timestamp,
	"attempted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "document_learning_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "email_rights_reviews" ADD COLUMN "source_text" text;--> statement-breakpoint
ALTER TABLE "document_imports" ADD COLUMN "source_text" text;--> statement-breakpoint
ALTER TABLE "document_imports" ADD COLUMN "learn_from_review" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "document_imports" ADD COLUMN "error_kind" text;--> statement-breakpoint
ALTER TABLE "document_learning_cases" ADD CONSTRAINT "document_learning_cases_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_learning_cases_source_uq" ON "document_learning_cases" USING btree ("source","source_ref");--> statement-breakpoint
CREATE INDEX "document_learning_cases_workflow_idx" ON "document_learning_cases" USING btree ("workflow","enabled");