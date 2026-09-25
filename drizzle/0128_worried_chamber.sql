ALTER TABLE "invoice_deliveries" ADD COLUMN "evidence" jsonb;--> statement-breakpoint
ALTER TABLE "document_imports" ADD COLUMN "funding_source_key" text;--> statement-breakpoint
ALTER TABLE "document_imports" ADD COLUMN "source_thread_id" uuid;--> statement-breakpoint
ALTER TABLE "document_imports" ADD COLUMN "source_message_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "document_imports_funding_source_uq" ON "document_imports" USING btree ("funding_source_key");