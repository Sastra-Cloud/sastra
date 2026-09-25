-- Budget reshaped to an itemized quotation; prior flat line items are dropped (re-seeded in-app).
DELETE FROM "budget_items";--> statement-breakpoint
CREATE TYPE "public"."budget_category" AS ENUM('translation', 'proofreading', 'editing', 'cover_design', 'typesetting', 'project_management', 'print_ship', 'audiobook', 'video_series', 'custom');--> statement-breakpoint
CREATE TYPE "public"."budget_group" AS ENUM('book_publishing', 'additional_media');--> statement-breakpoint
CREATE TYPE "public"."budget_unit" AS ENUM('words', 'pages', 'cover', 'project', 'flat');--> statement-breakpoint
CREATE TABLE "project_budget_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"word_count" integer DEFAULT 0 NOT NULL,
	"words_per_page" integer DEFAULT 217 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"rate_translation" numeric(10, 4) DEFAULT '0.03' NOT NULL,
	"rate_proofreading" numeric(10, 4) DEFAULT '0.01' NOT NULL,
	"rate_editing" numeric(10, 4) DEFAULT '0.03' NOT NULL,
	"rate_cover_design" numeric(10, 4) DEFAULT '100' NOT NULL,
	"rate_typesetting" numeric(10, 4) DEFAULT '3' NOT NULL,
	"rate_project_management" numeric(10, 4) DEFAULT '200' NOT NULL,
	"rate_print_ship" numeric(10, 4) DEFAULT '2000' NOT NULL,
	"rate_audiobook" numeric(10, 4) DEFAULT '0.01' NOT NULL,
	"rate_video_series" numeric(10, 4) DEFAULT '0.01' NOT NULL,
	"partner_name" text,
	"partner_contact" text,
	"work_description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "budget_items" ALTER COLUMN "category" SET DEFAULT 'custom'::"public"."budget_category";--> statement-breakpoint
ALTER TABLE "budget_items" ALTER COLUMN "category" SET DATA TYPE "public"."budget_category" USING "category"::"public"."budget_category";--> statement-breakpoint
ALTER TABLE "budget_items" ALTER COLUMN "category" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "budget_items" ADD COLUMN "group" "budget_group" DEFAULT 'book_publishing' NOT NULL;--> statement-breakpoint
ALTER TABLE "budget_items" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "budget_items" ADD COLUMN "unit" "budget_unit" DEFAULT 'flat' NOT NULL;--> statement-breakpoint
ALTER TABLE "budget_items" ADD COLUMN "quantity" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "budget_items" ADD COLUMN "unit_price" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "budget_items" ADD COLUMN "amount" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "budget_items" ADD COLUMN "is_auto_quantity" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "project_budget_settings" ADD CONSTRAINT "project_budget_settings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_budget_settings_project_uq" ON "project_budget_settings" USING btree ("project_id");