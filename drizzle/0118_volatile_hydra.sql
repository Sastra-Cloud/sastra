CREATE TABLE "donation_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"donation_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"funding_receipt_id" uuid NOT NULL,
	"mou_payment_id" uuid,
	"shared_mou_group_id" uuid,
	"amount" numeric(16, 2) NOT NULL,
	"note" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "donation_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_id" uuid NOT NULL,
	"source_filename" text NOT NULL,
	"file_hash" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"successful_rows" integer DEFAULT 0 NOT NULL,
	"failed_rows" integer DEFAULT 0 NOT NULL,
	"new_rows" integer DEFAULT 0 NOT NULL,
	"exact_duplicate_rows" integer DEFAULT 0 NOT NULL,
	"possible_duplicate_rows" integer DEFAULT 0 NOT NULL,
	"successful_amount" numeric(16, 2) DEFAULT '0' NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "donation_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"donation_id" uuid NOT NULL,
	"action" text NOT NULL,
	"previous_allocations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"next_allocations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reason" text,
	"actor_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "donations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"source_row_number" integer NOT NULL,
	"row_fingerprint" text NOT NULL,
	"campaign_external_id" text,
	"donor" text NOT NULL,
	"donor_key" text NOT NULL,
	"campaign" text,
	"recurring" text,
	"amount" numeric(16, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"payment_method" text,
	"source_status" text NOT NULL,
	"donation_date" date NOT NULL,
	"source_date_time" text NOT NULL,
	"notes" text,
	"review_status" text DEFAULT 'needs_review' NOT NULL,
	"duplicate_of_id" uuid,
	"duplicate_resolution_note" text,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "donation_allocations" ADD CONSTRAINT "donation_allocations_donation_id_donations_id_fk" FOREIGN KEY ("donation_id") REFERENCES "public"."donations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donation_allocations" ADD CONSTRAINT "donation_allocations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donation_allocations" ADD CONSTRAINT "donation_allocations_funding_receipt_id_funding_receipts_id_fk" FOREIGN KEY ("funding_receipt_id") REFERENCES "public"."funding_receipts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donation_allocations" ADD CONSTRAINT "donation_allocations_mou_payment_id_mou_payments_id_fk" FOREIGN KEY ("mou_payment_id") REFERENCES "public"."mou_payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donation_allocations" ADD CONSTRAINT "donation_allocations_shared_mou_group_id_shared_mou_groups_id_fk" FOREIGN KEY ("shared_mou_group_id") REFERENCES "public"."shared_mou_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donation_allocations" ADD CONSTRAINT "donation_allocations_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donation_imports" ADD CONSTRAINT "donation_imports_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donation_imports" ADD CONSTRAINT "donation_imports_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donation_reviews" ADD CONSTRAINT "donation_reviews_donation_id_donations_id_fk" FOREIGN KEY ("donation_id") REFERENCES "public"."donations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donation_reviews" ADD CONSTRAINT "donation_reviews_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_import_id_donation_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."donation_imports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "donation_allocations_receipt_uq" ON "donation_allocations" USING btree ("funding_receipt_id");--> statement-breakpoint
CREATE INDEX "donation_allocations_donation_idx" ON "donation_allocations" USING btree ("donation_id");--> statement-breakpoint
CREATE INDEX "donation_allocations_project_idx" ON "donation_allocations" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "donation_allocations_payment_idx" ON "donation_allocations" USING btree ("mou_payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "donation_imports_file_uq" ON "donation_imports" USING btree ("file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "donation_imports_hash_uq" ON "donation_imports" USING btree ("file_hash");--> statement-breakpoint
CREATE INDEX "donation_imports_created_idx" ON "donation_imports" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "donation_reviews_donation_idx" ON "donation_reviews" USING btree ("donation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "donations_row_fingerprint_uq" ON "donations" USING btree ("row_fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "donations_import_row_uq" ON "donations" USING btree ("import_id","source_row_number");--> statement-breakpoint
CREATE INDEX "donations_review_status_idx" ON "donations" USING btree ("review_status","donation_date");--> statement-breakpoint
CREATE INDEX "donations_duplicate_candidate_idx" ON "donations" USING btree ("donor_key","amount","donation_date");--> statement-breakpoint
CREATE INDEX "donations_import_idx" ON "donations" USING btree ("import_id");