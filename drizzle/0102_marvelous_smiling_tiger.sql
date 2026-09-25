CREATE TABLE "email_follow_ups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"source_message_id" uuid NOT NULL,
	"owner_user_id" text,
	"counterparty" text,
	"summary" text NOT NULL,
	"due_at" timestamp NOT NULL,
	"snoozed_until" timestamp,
	"notified_at" timestamp,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "external_follow_up_business_days" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "email_follow_ups" ADD CONSTRAINT "email_follow_ups_thread_id_email_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."email_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_follow_ups" ADD CONSTRAINT "email_follow_ups_source_message_id_email_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."email_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_follow_ups" ADD CONSTRAINT "email_follow_ups_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_follow_ups_thread_uq" ON "email_follow_ups" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "email_follow_ups_due_idx" ON "email_follow_ups" USING btree ("resolved_at","due_at");--> statement-breakpoint
CREATE INDEX "email_follow_ups_owner_idx" ON "email_follow_ups" USING btree ("owner_user_id","resolved_at","due_at");