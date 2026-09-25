ALTER TABLE "tasks" ADD COLUMN "print_run_id" uuid;--> statement-breakpoint
ALTER TABLE "budget_items" ADD COLUMN "print_run_id" uuid;--> statement-breakpoint
ALTER TABLE "funding_receipts" ADD COLUMN "print_run_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "print_run_id" uuid;--> statement-breakpoint
ALTER TABLE "mou_payments" ADD COLUMN "print_run_id" uuid;--> statement-breakpoint
ALTER TABLE "print_runs" ADD COLUMN "source_run_id" uuid;--> statement-breakpoint
ALTER TABLE "print_runs" ADD COLUMN "kind" text DEFAULT 'first_print' NOT NULL;--> statement-breakpoint
ALTER TABLE "print_runs" ADD COLUMN "print_number" integer;--> statement-breakpoint
UPDATE "print_runs" SET "print_number" = 1 WHERE "print_number" IS NULL;--> statement-breakpoint
ALTER TABLE "print_runs" ADD COLUMN "campaign_start_date" date;--> statement-breakpoint
ALTER TABLE "print_runs" ADD COLUMN "campaign_due_date" date;--> statement-breakpoint
ALTER TABLE "print_runs" ADD COLUMN "funding_goal" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "print_runs" ADD COLUMN "funding_currency" text DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE "print_runs" ADD COLUMN "reprint_reason" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_print_run_id_print_runs_id_fk" FOREIGN KEY ("print_run_id") REFERENCES "public"."print_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_print_run_id_print_runs_id_fk" FOREIGN KEY ("print_run_id") REFERENCES "public"."print_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_receipts" ADD CONSTRAINT "funding_receipts_print_run_id_print_runs_id_fk" FOREIGN KEY ("print_run_id") REFERENCES "public"."print_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_print_run_id_print_runs_id_fk" FOREIGN KEY ("print_run_id") REFERENCES "public"."print_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mou_payments" ADD CONSTRAINT "mou_payments_print_run_id_print_runs_id_fk" FOREIGN KEY ("print_run_id") REFERENCES "public"."print_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_runs" ADD CONSTRAINT "print_runs_source_run_id_print_runs_id_fk" FOREIGN KEY ("source_run_id") REFERENCES "public"."print_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_print_run_idx" ON "tasks" USING btree ("print_run_id");--> statement-breakpoint
CREATE INDEX "budget_items_project_idx" ON "budget_items" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "budget_items_print_run_idx" ON "budget_items" USING btree ("print_run_id");--> statement-breakpoint
CREATE INDEX "funding_receipts_print_run_idx" ON "funding_receipts" USING btree ("print_run_id");--> statement-breakpoint
CREATE INDEX "invoices_print_run_idx" ON "invoices" USING btree ("print_run_id");--> statement-breakpoint
CREATE INDEX "mou_payments_print_run_idx" ON "mou_payments" USING btree ("print_run_id");--> statement-breakpoint
CREATE INDEX "print_runs_kind_idx" ON "print_runs" USING btree ("kind","status");--> statement-breakpoint
CREATE INDEX "print_runs_source_idx" ON "print_runs" USING btree ("source_run_id");
