CREATE TABLE "notification_email_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_id" uuid NOT NULL,
	"recipient_id" text NOT NULL,
	"category" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"deliver_at" timestamp NOT NULL,
	"batch_id" text,
	"claimed_at" timestamp,
	"sent_at" timestamp,
	"suppressed_at" timestamp,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_preferences" ADD COLUMN "email_delivery_mode" text DEFAULT 'bundled' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_preferences" ADD COLUMN "email_digest_time_minutes" integer DEFAULT 480 NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_email_queue" ADD CONSTRAINT "notification_email_queue_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_email_queue" ADD CONSTRAINT "notification_email_queue_recipient_id_user_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_email_queue_notification_uq" ON "notification_email_queue" USING btree ("notification_id");--> statement-breakpoint
CREATE INDEX "notification_email_queue_due_idx" ON "notification_email_queue" USING btree ("state","deliver_at");--> statement-breakpoint
CREATE INDEX "notification_email_queue_recipient_idx" ON "notification_email_queue" USING btree ("recipient_id","state","deliver_at");