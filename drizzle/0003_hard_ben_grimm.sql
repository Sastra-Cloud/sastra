CREATE TYPE "public"."blocker_type" AS ENUM('rights', 'budget', 'overdue_task', 'overdue_dependency', 'stalled_task');--> statement-breakpoint
CREATE TYPE "public"."rights_kind" AS ENUM('translation', 'audio', 'video', 'reprint', 'other');--> statement-breakpoint
CREATE TYPE "public"."rights_status" AS ENUM('needed', 'requested', 'granted', 'denied');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('warning', 'critical');--> statement-breakpoint
CREATE TABLE "rights_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"rights_type" "rights_kind",
	"status" "rights_status" DEFAULT 'needed' NOT NULL,
	"counterparty" text,
	"requested_at" date,
	"resolved_at" date,
	"notes" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"label" text NOT NULL,
	"category" text,
	"amount_needed" numeric(14, 2) DEFAULT '0' NOT NULL,
	"amount_secured" numeric(14, 2) DEFAULT '0' NOT NULL,
	"amount_spent" numeric(14, 2) DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blockers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"type" "blocker_type" NOT NULL,
	"severity" "severity" DEFAULT 'warning' NOT NULL,
	"title" text NOT NULL,
	"source_type" text,
	"source_id" uuid,
	"is_resolved" boolean DEFAULT false NOT NULL,
	"detected_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "rights_items" ADD CONSTRAINT "rights_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rights_items" ADD CONSTRAINT "rights_items_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blockers" ADD CONSTRAINT "blockers_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blockers_project_idx" ON "blockers" USING btree ("project_id");