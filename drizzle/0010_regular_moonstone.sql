-- Rights model reshaped to one agreement per project; prior per-right rows are dropped.
DELETE FROM "rights_items";--> statement-breakpoint
CREATE TYPE "public"."agreement_type" AS ENUM('mou_only', 'mou_plus_license', 'license_only');--> statement-breakpoint
CREATE TYPE "public"."rights_overall" AS ENUM('none', 'in_progress', 'complete');--> statement-breakpoint
CREATE TYPE "public"."rights_step_status" AS ENUM('not_needed', 'not_started', 'in_progress', 'signed');--> statement-breakpoint
CREATE TABLE "rights_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"holder_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"role" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rights_holders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"website" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rights_items" ALTER COLUMN "title" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "rights_items" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "rights_items" ALTER COLUMN "status" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "rights_items" ADD COLUMN "agreement_type" "agreement_type" DEFAULT 'mou_plus_license' NOT NULL;--> statement-breakpoint
ALTER TABLE "rights_items" ADD COLUMN "mou_status" "rights_step_status" DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
ALTER TABLE "rights_items" ADD COLUMN "mou_commercial" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rights_items" ADD COLUMN "mou_signed_date" date;--> statement-breakpoint
ALTER TABLE "rights_items" ADD COLUMN "mou_holder_id" uuid;--> statement-breakpoint
ALTER TABLE "rights_items" ADD COLUMN "mou_contact_id" uuid;--> statement-breakpoint
ALTER TABLE "rights_items" ADD COLUMN "mou_assigned_to" text;--> statement-breakpoint
ALTER TABLE "rights_items" ADD COLUMN "mou_task_id" uuid;--> statement-breakpoint
ALTER TABLE "rights_items" ADD COLUMN "license_status" "rights_step_status" DEFAULT 'not_needed' NOT NULL;--> statement-breakpoint
ALTER TABLE "rights_items" ADD COLUMN "license_signed_date" date;--> statement-breakpoint
ALTER TABLE "rights_items" ADD COLUMN "license_holder_id" uuid;--> statement-breakpoint
ALTER TABLE "rights_items" ADD COLUMN "license_contact_id" uuid;--> statement-breakpoint
ALTER TABLE "rights_items" ADD COLUMN "license_assigned_to" text;--> statement-breakpoint
ALTER TABLE "rights_items" ADD COLUMN "license_task_id" uuid;--> statement-breakpoint
ALTER TABLE "rights_items" ADD COLUMN "commercial_granted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rights_items" ADD COLUMN "format_print" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rights_items" ADD COLUMN "format_ebook" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rights_items" ADD COLUMN "format_audio" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rights_items" ADD COLUMN "format_video" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rights_items" ADD COLUMN "rights_start_date" date;--> statement-breakpoint
ALTER TABLE "rights_items" ADD COLUMN "complete_by_date" date;--> statement-breakpoint
ALTER TABLE "rights_items" ADD COLUMN "max_copies" integer;--> statement-breakpoint
ALTER TABLE "rights_items" ADD COLUMN "overall_status" "rights_overall" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "rights_contacts" ADD CONSTRAINT "rights_contacts_holder_id_rights_holders_id_fk" FOREIGN KEY ("holder_id") REFERENCES "public"."rights_holders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rights_items" ADD CONSTRAINT "rights_items_mou_holder_id_rights_holders_id_fk" FOREIGN KEY ("mou_holder_id") REFERENCES "public"."rights_holders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rights_items" ADD CONSTRAINT "rights_items_mou_contact_id_rights_contacts_id_fk" FOREIGN KEY ("mou_contact_id") REFERENCES "public"."rights_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rights_items" ADD CONSTRAINT "rights_items_mou_assigned_to_user_id_fk" FOREIGN KEY ("mou_assigned_to") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rights_items" ADD CONSTRAINT "rights_items_mou_task_id_tasks_id_fk" FOREIGN KEY ("mou_task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rights_items" ADD CONSTRAINT "rights_items_license_holder_id_rights_holders_id_fk" FOREIGN KEY ("license_holder_id") REFERENCES "public"."rights_holders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rights_items" ADD CONSTRAINT "rights_items_license_contact_id_rights_contacts_id_fk" FOREIGN KEY ("license_contact_id") REFERENCES "public"."rights_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rights_items" ADD CONSTRAINT "rights_items_license_assigned_to_user_id_fk" FOREIGN KEY ("license_assigned_to") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rights_items" ADD CONSTRAINT "rights_items_license_task_id_tasks_id_fk" FOREIGN KEY ("license_task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rights_items_project_uq" ON "rights_items" USING btree ("project_id");