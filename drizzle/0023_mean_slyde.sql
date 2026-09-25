CREATE TYPE "public"."project_kind" AS ENUM('book', 'article', 'other');--> statement-breakpoint
CREATE TABLE "mou_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"due_date" date,
	"notes" text,
	"paid_at" timestamp,
	"receipt_id" uuid,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_roles" ADD COLUMN "default_duration_days" integer;--> statement-breakpoint
ALTER TABLE "phases" ADD COLUMN "project_role_id" uuid;--> statement-breakpoint
ALTER TABLE "phases" ADD COLUMN "duration_days" integer;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "khmer_title" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "kind" "project_kind";--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "mou_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "requires_royalties" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "royalty_percentage" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "mou_payments" ADD CONSTRAINT "mou_payments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mou_payments" ADD CONSTRAINT "mou_payments_receipt_id_funding_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."funding_receipts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mou_payments" ADD CONSTRAINT "mou_payments_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mou_payments_project_idx" ON "mou_payments" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "phases" ADD CONSTRAINT "phases_project_role_id_project_roles_id_fk" FOREIGN KEY ("project_role_id") REFERENCES "public"."project_roles"("id") ON DELETE set null ON UPDATE no action;