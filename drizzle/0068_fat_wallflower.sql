CREATE TABLE "partner_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"first_name" text,
	"last_name" text,
	"email" text,
	"phone" text,
	"role" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"website" text,
	"notes" text,
	"source_import_id" uuid,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_budget_settings" ADD COLUMN "partner_id" uuid;--> statement-breakpoint
ALTER TABLE "project_budget_settings" ADD COLUMN "partner_contact_id" uuid;--> statement-breakpoint
ALTER TABLE "partner_contacts" ADD CONSTRAINT "partner_contacts_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "partner_contacts_partner_idx" ON "partner_contacts" USING btree ("partner_id");--> statement-breakpoint
ALTER TABLE "project_budget_settings" ADD CONSTRAINT "project_budget_settings_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_budget_settings" ADD CONSTRAINT "project_budget_settings_partner_contact_id_partner_contacts_id_fk" FOREIGN KEY ("partner_contact_id") REFERENCES "public"."partner_contacts"("id") ON DELETE set null ON UPDATE no action;