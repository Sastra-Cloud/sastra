ALTER TABLE "funding_receipts" ADD COLUMN "proposal_id" uuid;--> statement-breakpoint
ALTER TABLE "mou_payments" ADD COLUMN "funding_basis" text;--> statement-breakpoint
ALTER TABLE "mou_payments" ADD COLUMN "partner_name" text;--> statement-breakpoint
ALTER TABLE "mou_payments" ADD COLUMN "proposal_id" uuid;--> statement-breakpoint
ALTER TABLE "proposal_submissions" ADD COLUMN "partner_name" text;--> statement-breakpoint
ALTER TABLE "proposal_submissions" ADD COLUMN "partner_id" uuid;--> statement-breakpoint
ALTER TABLE "proposal_submissions" ADD COLUMN "funding_path" text;--> statement-breakpoint
ALTER TABLE "proposal_submissions" ADD COLUMN "agreed_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "proposal_submissions" ADD COLUMN "answered_on" date;--> statement-breakpoint
ALTER TABLE "proposal_submissions" ADD COLUMN "answer_note" text;--> statement-breakpoint
ALTER TABLE "proposal_submissions" ADD COLUMN "answered_by" text;--> statement-breakpoint
ALTER TABLE "funding_receipts" ADD CONSTRAINT "funding_receipts_proposal_id_proposal_submissions_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposal_submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mou_payments" ADD CONSTRAINT "mou_payments_proposal_id_proposal_submissions_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposal_submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_submissions" ADD CONSTRAINT "proposal_submissions_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_submissions" ADD CONSTRAINT "proposal_submissions_answered_by_user_id_fk" FOREIGN KEY ("answered_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "funding_receipts_proposal_idx" ON "funding_receipts" USING btree ("proposal_id");--> statement-breakpoint
CREATE INDEX "mou_payments_proposal_idx" ON "mou_payments" USING btree ("proposal_id");