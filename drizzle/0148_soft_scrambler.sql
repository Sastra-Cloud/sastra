CREATE TABLE "sponsorship_fund_uses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sponsorship_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"used_date" date NOT NULL,
	"note" text NOT NULL,
	"recorded_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"reversed_at" timestamp,
	"reversed_by" text,
	"reversal_reason" text,
	CONSTRAINT "sponsorship_fund_uses_amount_check" CHECK ("sponsorship_fund_uses"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "sponsorship_receipt_allocations" DROP CONSTRAINT "sponsorship_receipt_allocations_funding_receipt_id_funding_receipts_id_fk";
--> statement-breakpoint
DROP INDEX "sponsorship_receipt_allocation_funding_uq";--> statement-breakpoint
ALTER TABLE "sponsorship_fund_uses" ADD CONSTRAINT "sponsorship_fund_uses_sponsorship_id_sponsorships_id_fk" FOREIGN KEY ("sponsorship_id") REFERENCES "public"."sponsorships"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsorship_fund_uses" ADD CONSTRAINT "sponsorship_fund_uses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsorship_fund_uses" ADD CONSTRAINT "sponsorship_fund_uses_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsorship_fund_uses" ADD CONSTRAINT "sponsorship_fund_uses_reversed_by_user_id_fk" FOREIGN KEY ("reversed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sponsorship_fund_uses_sponsorship_idx" ON "sponsorship_fund_uses" USING btree ("sponsorship_id");--> statement-breakpoint
CREATE INDEX "sponsorship_fund_uses_project_idx" ON "sponsorship_fund_uses" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "sponsorship_receipt_allocations" DROP COLUMN "funding_receipt_id";