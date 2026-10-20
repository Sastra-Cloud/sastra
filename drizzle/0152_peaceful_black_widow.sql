CREATE TABLE "donation_csv_formats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"header_signature" text NOT NULL,
	"headers" jsonb NOT NULL,
	"mapping" jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "donation_imports" ADD COLUMN "format_name" text;--> statement-breakpoint
ALTER TABLE "donation_csv_formats" ADD CONSTRAINT "donation_csv_formats_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "donation_csv_formats_signature_uq" ON "donation_csv_formats" USING btree ("header_signature");