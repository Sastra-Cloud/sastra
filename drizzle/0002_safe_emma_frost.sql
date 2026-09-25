CREATE TYPE "public"."attach_target" AS ENUM('message', 'task', 'rights_item', 'budget_item', 'project');--> statement-breakpoint
CREATE TYPE "public"."file_status" AS ENUM('pending', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "file_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_id" uuid NOT NULL,
	"target_type" "attach_target" NOT NULL,
	"target_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"r2_key" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint DEFAULT 0 NOT NULL,
	"status" "file_status" DEFAULT 'pending' NOT NULL,
	"uploaded_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "files_r2_key_unique" UNIQUE("r2_key")
);
--> statement-breakpoint
ALTER TABLE "file_attachments" ADD CONSTRAINT "file_attachments_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "file_attachments_target_idx" ON "file_attachments" USING btree ("target_type","target_id");