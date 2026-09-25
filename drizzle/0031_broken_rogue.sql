CREATE TABLE "license_fee_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"period" text NOT NULL,
	"amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"due_date" date,
	"assignee_id" text,
	"task_id" uuid,
	"notes" text,
	"paid_at" timestamp,
	"paid_by" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rights_items" ADD COLUMN "license_fee_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "rights_items" ADD COLUMN "license_fee_currency" text;--> statement-breakpoint
ALTER TABLE "rights_items" ADD COLUMN "license_fee_due_date" date;--> statement-breakpoint
ALTER TABLE "rights_items" ADD COLUMN "license_fee_recurs" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rights_items" ADD COLUMN "license_fee_assigned_to" text;--> statement-breakpoint
ALTER TABLE "license_fee_payments" ADD CONSTRAINT "license_fee_payments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_fee_payments" ADD CONSTRAINT "license_fee_payments_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_fee_payments" ADD CONSTRAINT "license_fee_payments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_fee_payments" ADD CONSTRAINT "license_fee_payments_paid_by_user_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_fee_payments" ADD CONSTRAINT "license_fee_payments_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "license_fee_payments_project_period_uq" ON "license_fee_payments" USING btree ("project_id","period");--> statement-breakpoint
CREATE INDEX "license_fee_payments_project_idx" ON "license_fee_payments" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "rights_items" ADD CONSTRAINT "rights_items_license_fee_assigned_to_user_id_fk" FOREIGN KEY ("license_fee_assigned_to") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;