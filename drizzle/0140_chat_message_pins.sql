ALTER TABLE "chat_messages" ADD COLUMN "pinned_at" timestamp;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "pinned_by_user_id" text;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_pinned_by_user_id_user_id_fk" FOREIGN KEY ("pinned_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_messages_channel_pinned_idx" ON "chat_messages" USING btree ("channel_id","pinned_at") WHERE "chat_messages"."pinned_at" is not null;