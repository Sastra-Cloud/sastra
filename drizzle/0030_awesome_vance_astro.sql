CREATE TABLE "license_renewal_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"period" text NOT NULL,
	"task_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rights_items" ADD COLUMN "license_term_months" integer;--> statement-breakpoint
ALTER TABLE "rights_items" ADD COLUMN "license_auto_renews" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rights_items" ADD COLUMN "license_renewal_months" integer;--> statement-breakpoint
ALTER TABLE "rights_items" ADD COLUMN "license_renewal_notice_days" integer;--> statement-breakpoint
ALTER TABLE "rights_items" ADD COLUMN "license_renewal_lead_days" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "rights_items" ADD COLUMN "license_renewal_assigned_to" text;--> statement-breakpoint
ALTER TABLE "rights_items" ADD COLUMN "copyright_holder_id" uuid;--> statement-breakpoint
ALTER TABLE "rights_items" ADD COLUMN "copyright_notice" text;--> statement-breakpoint
ALTER TABLE "license_renewal_reminders" ADD CONSTRAINT "license_renewal_reminders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_renewal_reminders" ADD CONSTRAINT "license_renewal_reminders_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "license_renewal_reminders_project_period_uq" ON "license_renewal_reminders" USING btree ("project_id","period");--> statement-breakpoint
ALTER TABLE "rights_items" ADD CONSTRAINT "rights_items_license_renewal_assigned_to_user_id_fk" FOREIGN KEY ("license_renewal_assigned_to") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rights_items" ADD CONSTRAINT "rights_items_copyright_holder_id_rights_holders_id_fk" FOREIGN KEY ("copyright_holder_id") REFERENCES "public"."rights_holders"("id") ON DELETE set null ON UPDATE no action;