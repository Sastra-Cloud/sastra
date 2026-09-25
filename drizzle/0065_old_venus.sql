CREATE TABLE "workspace_settings" (
	"id" text PRIMARY KEY DEFAULT 'workspace' NOT NULL,
	"logo_file_id" text,
	"accent_color" text DEFAULT '#B65C3A' NOT NULL,
	"org_name" text,
	"prepared_by_note" text,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_budget_settings" ADD COLUMN "partner_contact_first_name" text;--> statement-breakpoint
ALTER TABLE "project_budget_settings" ADD COLUMN "partner_contact_email" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD CONSTRAINT "workspace_settings_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;