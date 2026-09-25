ALTER TABLE "mou_payments" ADD COLUMN "payment_due_date" date;--> statement-breakpoint
ALTER TABLE "mou_payments" ADD COLUMN "delivery_requirements" jsonb;--> statement-breakpoint
ALTER TABLE "mou_payments" ADD COLUMN "delivery_evidence" jsonb;--> statement-breakpoint
ALTER TABLE "mou_payments" ADD COLUMN "delivery_confirmed_at" timestamp;--> statement-breakpoint
ALTER TABLE "mou_payments" ADD COLUMN "delivery_confirmed_by" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "event_key" text;--> statement-breakpoint
ALTER TABLE "mou_payments" ADD CONSTRAINT "mou_payments_delivery_confirmed_by_user_id_fk" FOREIGN KEY ("delivery_confirmed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_event_recipient_uq" ON "notifications" USING btree ("event_key","user_id");