ALTER TYPE "public"."file_purpose" ADD VALUE 'sponsorship_invoice' BEFORE 'system_generated';--> statement-breakpoint
CREATE TABLE "sponsorship_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sponsorship_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "sponsorship_lines_quantity_check" CHECK ("sponsorship_lines"."quantity" > 0),
	CONSTRAINT "sponsorship_lines_price_check" CHECK ("sponsorship_lines"."unit_price" > 0)
);
--> statement-breakpoint
CREATE TABLE "sponsorship_receipt_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"actual_net_amount" numeric(14, 2) NOT NULL,
	"funding_receipt_id" uuid
);
--> statement-breakpoint
CREATE TABLE "sponsorship_receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sponsorship_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"actual_net_amount" numeric(14, 2) NOT NULL,
	"received_date" date NOT NULL,
	"note" text,
	"recorded_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"reversed_at" timestamp,
	"reversed_by" text,
	"reversal_reason" text,
	CONSTRAINT "sponsorship_receipts_amount_check" CHECK ("sponsorship_receipts"."amount" > 0 and "sponsorship_receipts"."actual_net_amount" between 0 and "sponsorship_receipts"."amount")
);
--> statement-breakpoint
CREATE TABLE "sponsorships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"partner_id" uuid,
	"recipient_name" text NOT NULL,
	"recipient_email" text,
	"recipient_address" text,
	"currency" text NOT NULL,
	"due_date" date,
	"notes" text,
	"deduction_bps" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sponsorships_status_check" CHECK ("sponsorships"."status" in ('draft', 'invoiced', 'cancelled')),
	CONSTRAINT "sponsorships_deduction_check" CHECK ("sponsorships"."deduction_bps" between 0 and 9999)
);
--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "enabled_modules" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "sponsorship_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "line_items" jsonb;--> statement-breakpoint
ALTER TABLE "sponsorship_lines" ADD CONSTRAINT "sponsorship_lines_sponsorship_id_sponsorships_id_fk" FOREIGN KEY ("sponsorship_id") REFERENCES "public"."sponsorships"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsorship_lines" ADD CONSTRAINT "sponsorship_lines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsorship_receipt_allocations" ADD CONSTRAINT "sponsorship_receipt_allocations_receipt_id_sponsorship_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."sponsorship_receipts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsorship_receipt_allocations" ADD CONSTRAINT "sponsorship_receipt_allocations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsorship_receipt_allocations" ADD CONSTRAINT "sponsorship_receipt_allocations_funding_receipt_id_funding_receipts_id_fk" FOREIGN KEY ("funding_receipt_id") REFERENCES "public"."funding_receipts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsorship_receipts" ADD CONSTRAINT "sponsorship_receipts_sponsorship_id_sponsorships_id_fk" FOREIGN KEY ("sponsorship_id") REFERENCES "public"."sponsorships"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsorship_receipts" ADD CONSTRAINT "sponsorship_receipts_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsorship_receipts" ADD CONSTRAINT "sponsorship_receipts_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsorship_receipts" ADD CONSTRAINT "sponsorship_receipts_reversed_by_user_id_fk" FOREIGN KEY ("reversed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsorships" ADD CONSTRAINT "sponsorships_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsorships" ADD CONSTRAINT "sponsorships_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sponsorship_lines_sponsorship_idx" ON "sponsorship_lines" USING btree ("sponsorship_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sponsorship_receipt_allocation_project_uq" ON "sponsorship_receipt_allocations" USING btree ("receipt_id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sponsorship_receipt_allocation_funding_uq" ON "sponsorship_receipt_allocations" USING btree ("funding_receipt_id");--> statement-breakpoint
CREATE INDEX "sponsorship_receipts_sponsorship_idx" ON "sponsorship_receipts" USING btree ("sponsorship_id");--> statement-breakpoint
CREATE INDEX "sponsorships_partner_idx" ON "sponsorships" USING btree ("partner_id");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_sponsorship_id_sponsorships_id_fk" FOREIGN KEY ("sponsorship_id") REFERENCES "public"."sponsorships"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_active_sponsorship_uq" ON "invoices" USING btree ("sponsorship_id") WHERE "invoices"."status" <> 'void';