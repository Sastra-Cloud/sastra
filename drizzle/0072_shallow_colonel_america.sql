ALTER TABLE "email_threads" ADD COLUMN "partner_id" uuid;--> statement-breakpoint
ALTER TABLE "email_threads" ADD COLUMN "partner_contact_id" uuid;--> statement-breakpoint
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_partner_contact_id_partner_contacts_id_fk" FOREIGN KEY ("partner_contact_id") REFERENCES "public"."partner_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_threads_partner_idx" ON "email_threads" USING btree ("partner_id");