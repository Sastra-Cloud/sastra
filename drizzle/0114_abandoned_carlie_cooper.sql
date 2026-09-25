ALTER TYPE "public"."channel_kind" ADD VALUE 'direct' BEFORE 'standup';--> statement-breakpoint
CREATE TABLE "chat_channel_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_channels" ADD COLUMN "direct_key" text;--> statement-breakpoint
ALTER TABLE "chat_channel_members" ADD CONSTRAINT "chat_channel_members_channel_id_chat_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."chat_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_channel_members" ADD CONSTRAINT "chat_channel_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_channel_members_unique" ON "chat_channel_members" USING btree ("channel_id","user_id");--> statement-breakpoint
CREATE INDEX "chat_channel_members_user_idx" ON "chat_channel_members" USING btree ("user_id","channel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_channels_direct_key_uq" ON "chat_channels" USING btree ("direct_key");