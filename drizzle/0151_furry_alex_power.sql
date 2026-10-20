ALTER TABLE "donation_allocations" ALTER COLUMN "funding_receipt_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "donation_allocations" ADD COLUMN "sponsorship_receipt_id" uuid;--> statement-breakpoint
ALTER TABLE "donation_allocations" ADD COLUMN "invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "donation_allocations" ADD CONSTRAINT "donation_allocations_sponsorship_receipt_id_sponsorship_receipts_id_fk" FOREIGN KEY ("sponsorship_receipt_id") REFERENCES "public"."sponsorship_receipts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donation_allocations" ADD CONSTRAINT "donation_allocations_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "donation_allocations_invoice_idx" ON "donation_allocations" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "donation_allocations_sponsorship_receipt_idx" ON "donation_allocations" USING btree ("sponsorship_receipt_id");--> statement-breakpoint
ALTER TABLE "donation_allocations" ADD CONSTRAINT "donation_allocations_one_receipt_check" CHECK (num_nonnulls("donation_allocations"."funding_receipt_id", "donation_allocations"."sponsorship_receipt_id") = 1);