CREATE TABLE "budget_scope_presentations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"print_run_id" uuid,
	"mode" text DEFAULT 'itemized' NOT NULL,
	"deduction_bps" integer DEFAULT 1300 NOT NULL,
	"public_description" text,
	"per_copy_quantity" integer,
	"per_copy_unit_price" numeric(14, 2),
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"sent_by_user_id" text,
	"recipient_email" text NOT NULL,
	"cc_emails" jsonb,
	"subject" text NOT NULL,
	"email_thread_id" uuid,
	"sent_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "budget_approval_requests_current_project_uq";--> statement-breakpoint
DROP INDEX "invoices_mou_payment_uq";--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "default_funding_deduction_bps" integer DEFAULT 1300 NOT NULL;--> statement-breakpoint
ALTER TABLE "budget_approval_requests" ADD COLUMN "print_run_id" uuid;--> statement-breakpoint
ALTER TABLE "budget_items" ADD COLUMN "partner_label" text;--> statement-breakpoint
ALTER TABLE "budget_items" ADD COLUMN "partner_unit_price" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "budget_items" ADD COLUMN "partner_visible" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "funding_receipts" ADD COLUMN "deduction_bps" integer;--> statement-breakpoint
ALTER TABLE "funding_receipts" ADD COLUMN "expected_net_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "funding_receipts" ADD COLUMN "actual_net_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "rendered_file_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "status" text DEFAULT 'issued' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "voided_at" timestamp;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "voided_by" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "replaces_invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "mou_payments" ADD COLUMN "public_description" text;--> statement-breakpoint
ALTER TABLE "proposal_submissions" ADD COLUMN "print_run_id" uuid;--> statement-breakpoint
ALTER TABLE "shared_mou_receipt_allocations" ADD COLUMN "actual_net_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "shared_mou_receipts" ADD COLUMN "deduction_bps" integer;--> statement-breakpoint
ALTER TABLE "shared_mou_receipts" ADD COLUMN "expected_net_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "shared_mou_receipts" ADD COLUMN "actual_net_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "budget_scope_presentations" ADD CONSTRAINT "budget_scope_presentations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_scope_presentations" ADD CONSTRAINT "budget_scope_presentations_print_run_id_print_runs_id_fk" FOREIGN KEY ("print_run_id") REFERENCES "public"."print_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_scope_presentations" ADD CONSTRAINT "budget_scope_presentations_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_scope_presentations" ADD CONSTRAINT "budget_scope_presentations_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_deliveries" ADD CONSTRAINT "invoice_deliveries_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_deliveries" ADD CONSTRAINT "invoice_deliveries_sent_by_user_id_user_id_fk" FOREIGN KEY ("sent_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_deliveries" ADD CONSTRAINT "invoice_deliveries_email_thread_id_email_threads_id_fk" FOREIGN KEY ("email_thread_id") REFERENCES "public"."email_threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "budget_scope_presentations_main_uq" ON "budget_scope_presentations" USING btree ("project_id") WHERE "budget_scope_presentations"."print_run_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "budget_scope_presentations_run_uq" ON "budget_scope_presentations" USING btree ("project_id","print_run_id") WHERE "budget_scope_presentations"."print_run_id" is not null;--> statement-breakpoint
CREATE INDEX "budget_scope_presentations_project_idx" ON "budget_scope_presentations" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "invoice_deliveries_invoice_idx" ON "invoice_deliveries" USING btree ("invoice_id","sent_at");--> statement-breakpoint
ALTER TABLE "budget_approval_requests" ADD CONSTRAINT "budget_approval_requests_print_run_id_print_runs_id_fk" FOREIGN KEY ("print_run_id") REFERENCES "public"."print_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_rendered_file_id_files_id_fk" FOREIGN KEY ("rendered_file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_voided_by_user_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_submissions" ADD CONSTRAINT "proposal_submissions_print_run_id_print_runs_id_fk" FOREIGN KEY ("print_run_id") REFERENCES "public"."print_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "budget_approval_requests_current_main_uq" ON "budget_approval_requests" USING btree ("project_id") WHERE "budget_approval_requests"."print_run_id" is null and "budget_approval_requests"."status" <> 'superseded';--> statement-breakpoint
CREATE UNIQUE INDEX "budget_approval_requests_current_run_uq" ON "budget_approval_requests" USING btree ("project_id","print_run_id") WHERE "budget_approval_requests"."print_run_id" is not null and "budget_approval_requests"."status" <> 'superseded';--> statement-breakpoint
CREATE INDEX "budget_approval_requests_print_run_idx" ON "budget_approval_requests" USING btree ("print_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_active_mou_payment_uq" ON "invoices" USING btree ("mou_payment_id") WHERE "invoices"."mou_payment_id" is not null and "invoices"."status" <> 'void';--> statement-breakpoint
CREATE INDEX "proposal_submissions_print_run_idx" ON "proposal_submissions" USING btree ("print_run_id");