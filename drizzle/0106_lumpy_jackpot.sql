ALTER TABLE "email_messages" ADD COLUMN "in_reply_to_header" text;--> statement-breakpoint
ALTER TABLE "email_messages" ADD COLUMN "reference_headers" text[];--> statement-breakpoint
ALTER TABLE "email_messages" ADD COLUMN "provider_thread_id" text;--> statement-breakpoint
ALTER TABLE "email_threads" ADD COLUMN "provider_thread_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "email_threads_provider_thread_uq" ON "email_threads" USING btree ("mailbox","provider_thread_id");