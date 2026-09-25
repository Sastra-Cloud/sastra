CREATE TYPE "public"."import_status" AS ENUM('uploaded', 'parsing', 'extracted', 'failed', 'committed', 'discarded');--> statement-breakpoint
CREATE TABLE "document_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_id" uuid,
	"status" "import_status" DEFAULT 'uploaded' NOT NULL,
	"extraction" jsonb,
	"reviewed" jsonb,
	"committed_project_ids" uuid[],
	"model" text,
	"error" text,
	"created_by" text,
	"committed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_imports" ADD CONSTRAINT "document_imports_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_imports" ADD CONSTRAINT "document_imports_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;