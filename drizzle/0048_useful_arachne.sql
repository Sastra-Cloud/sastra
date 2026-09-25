CREATE TYPE "public"."obligation_cadence" AS ENUM('per_episode', 'per_artwork', 'quarterly', 'standing', 'on_publish');--> statement-breakpoint
CREATE TYPE "public"."obligation_kind" AS ENUM('attribution', 'copyright_notice', 'artwork_approval', 'analytics_report', 'format_restriction', 'territory_restriction', 'sample_delivery', 'other');--> statement-breakpoint
CREATE TYPE "public"."unit_status" AS ENUM('draft', 'scheduled', 'published');--> statement-breakpoint
ALTER TYPE "public"."project_kind" ADD VALUE 'podcast' BEFORE 'other';--> statement-breakpoint
CREATE TABLE "license_obligations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"rights_item_id" uuid,
	"clause_ref" text,
	"kind" "obligation_kind" DEFAULT 'other' NOT NULL,
	"cadence" "obligation_cadence" DEFAULT 'standing' NOT NULL,
	"label" text NOT NULL,
	"text" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"assignee_id" text,
	"recurring_task_id" uuid,
	"task_id" uuid,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "units" ADD COLUMN "status" "unit_status" DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "units" ADD COLUMN "scheduled_date" date;--> statement-breakpoint
ALTER TABLE "units" ADD COLUMN "published_date" date;--> statement-breakpoint
ALTER TABLE "units" ADD COLUMN "external_url" text;--> statement-breakpoint
ALTER TABLE "rights_items" ADD COLUMN "territory" text;--> statement-breakpoint
ALTER TABLE "license_obligations" ADD CONSTRAINT "license_obligations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_obligations" ADD CONSTRAINT "license_obligations_rights_item_id_rights_items_id_fk" FOREIGN KEY ("rights_item_id") REFERENCES "public"."rights_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_obligations" ADD CONSTRAINT "license_obligations_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_obligations" ADD CONSTRAINT "license_obligations_recurring_task_id_recurring_tasks_id_fk" FOREIGN KEY ("recurring_task_id") REFERENCES "public"."recurring_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_obligations" ADD CONSTRAINT "license_obligations_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_obligations" ADD CONSTRAINT "license_obligations_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "license_obligations_project_idx" ON "license_obligations" USING btree ("project_id");