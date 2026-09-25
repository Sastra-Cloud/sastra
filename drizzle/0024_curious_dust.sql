CREATE TABLE "invoice_sequences" (
	"id" text PRIMARY KEY NOT NULL,
	"prefix" text DEFAULT '' NOT NULL,
	"next_number" integer DEFAULT 1 NOT NULL,
	"padding" integer DEFAULT 5 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"mou_payment_id" uuid,
	"invoice_number" text NOT NULL,
	"recipient_name" text,
	"recipient_email" text,
	"amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"issue_date" date NOT NULL,
	"due_date" date,
	"description" text NOT NULL,
	"notes" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mou_payments" ADD COLUMN "trigger" text DEFAULT 'custom' NOT NULL;--> statement-breakpoint
ALTER TABLE "mou_payments" ADD COLUMN "invoice_assignee_id" text;--> statement-breakpoint
ALTER TABLE "mou_payments" ADD COLUMN "invoice_task_id" uuid;--> statement-breakpoint
ALTER TABLE "mou_payments" ADD COLUMN "invoice_requested_at" timestamp;--> statement-breakpoint
ALTER TABLE "project_budget_settings" ADD COLUMN "royalty_recipient_email" text;--> statement-breakpoint
ALTER TABLE "project_budget_settings" ADD COLUMN "royalty_due_month" integer;--> statement-breakpoint
ALTER TABLE "project_budget_settings" ADD COLUMN "royalty_due_day" integer;--> statement-breakpoint
ALTER TABLE "project_budget_settings" ADD COLUMN "royalty_task_assignee_id" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_mou_payment_id_mou_payments_id_fk" FOREIGN KEY ("mou_payment_id") REFERENCES "public"."mou_payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_number_uq" ON "invoices" USING btree ("invoice_number");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_mou_payment_uq" ON "invoices" USING btree ("mou_payment_id");--> statement-breakpoint
CREATE INDEX "invoices_project_idx" ON "invoices" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "mou_payments" ADD CONSTRAINT "mou_payments_invoice_assignee_id_user_id_fk" FOREIGN KEY ("invoice_assignee_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mou_payments" ADD CONSTRAINT "mou_payments_invoice_task_id_tasks_id_fk" FOREIGN KEY ("invoice_task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_budget_settings" ADD CONSTRAINT "project_budget_settings_royalty_task_assignee_id_user_id_fk" FOREIGN KEY ("royalty_task_assignee_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;