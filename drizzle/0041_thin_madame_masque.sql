ALTER TYPE "public"."attach_target" ADD VALUE 'print_quote';--> statement-breakpoint
ALTER TYPE "public"."attach_target" ADD VALUE 'print_payment';--> statement-breakpoint
CREATE TABLE "print_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"company" text,
	"email" text,
	"domain" text,
	"phone" text,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "print_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"quote_id" uuid,
	"kind" text DEFAULT 'custom' NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"due_date" date,
	"needed_by_date" date,
	"wire_requested_at" timestamp,
	"wire_email_thread_id" uuid,
	"paid_at" timestamp,
	"paid_by" text,
	"notes" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "print_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"contact_id" uuid,
	"source_thread_id" uuid,
	"source_message_id" uuid,
	"kind" text DEFAULT 'quote' NOT NULL,
	"review_status" text DEFAULT 'active' NOT NULL,
	"invoice_number" text,
	"issue_date" date,
	"title" text,
	"quantity_cps" integer,
	"unit_price" numeric(10, 3),
	"total_amount" numeric(14, 2),
	"deposit_amount" numeric(14, 2),
	"balance_amount" numeric(14, 2),
	"currency" text DEFAULT 'USD' NOT NULL,
	"trim_width_mm" numeric(8, 2),
	"trim_height_mm" numeric(8, 2),
	"text_pages" integer,
	"cover_pages" integer,
	"text_spec" text,
	"cover_spec" text,
	"binding" text,
	"delivery_location" text,
	"payment_terms" text,
	"raw_extract" jsonb,
	"accepted_at" timestamp,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "print_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"contact_id" uuid,
	"title" text NOT NULL,
	"status" text DEFAULT 'planning' NOT NULL,
	"quantity_target" integer,
	"requested_quantities" integer[],
	"trim_width_in" numeric(6, 2) DEFAULT '6.00' NOT NULL,
	"trim_height_in" numeric(6, 2) DEFAULT '9.00' NOT NULL,
	"language_expansion_factor" numeric(5, 2) DEFAULT '1.15' NOT NULL,
	"estimated_text_pages" integer DEFAULT 0 NOT NULL,
	"quoted_text_pages" integer,
	"cover_pages" integer DEFAULT 4 NOT NULL,
	"text_paper" text,
	"cover_paper" text,
	"binding" text,
	"delivery_location" text DEFAULT 'Foshan' NOT NULL,
	"latest_proof_url" text,
	"notes" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "print_thread_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"project_id" uuid,
	"contact_id" uuid,
	"run_id" uuid,
	"matched_by" text DEFAULT 'participant' NOT NULL,
	"latest_proof_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_print_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"default_contact_id" uuid,
	"trim_width_in" numeric(6, 2) DEFAULT '6.00' NOT NULL,
	"trim_height_in" numeric(6, 2) DEFAULT '9.00' NOT NULL,
	"language_expansion_factor" numeric(5, 2) DEFAULT '1.15' NOT NULL,
	"financial_email" text DEFAULT 'finance@example.org' NOT NULL,
	"cc_emails" text[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "print_payments" ADD CONSTRAINT "print_payments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_payments" ADD CONSTRAINT "print_payments_run_id_print_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."print_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_payments" ADD CONSTRAINT "print_payments_quote_id_print_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."print_quotes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_payments" ADD CONSTRAINT "print_payments_wire_email_thread_id_email_threads_id_fk" FOREIGN KEY ("wire_email_thread_id") REFERENCES "public"."email_threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_payments" ADD CONSTRAINT "print_payments_paid_by_user_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_payments" ADD CONSTRAINT "print_payments_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_quotes" ADD CONSTRAINT "print_quotes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_quotes" ADD CONSTRAINT "print_quotes_run_id_print_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."print_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_quotes" ADD CONSTRAINT "print_quotes_contact_id_print_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."print_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_quotes" ADD CONSTRAINT "print_quotes_source_thread_id_email_threads_id_fk" FOREIGN KEY ("source_thread_id") REFERENCES "public"."email_threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_quotes" ADD CONSTRAINT "print_quotes_source_message_id_email_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."email_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_quotes" ADD CONSTRAINT "print_quotes_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_runs" ADD CONSTRAINT "print_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_runs" ADD CONSTRAINT "print_runs_contact_id_print_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."print_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_runs" ADD CONSTRAINT "print_runs_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_thread_links" ADD CONSTRAINT "print_thread_links_thread_id_email_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."email_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_thread_links" ADD CONSTRAINT "print_thread_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_thread_links" ADD CONSTRAINT "print_thread_links_contact_id_print_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."print_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_thread_links" ADD CONSTRAINT "print_thread_links_run_id_print_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."print_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_print_settings" ADD CONSTRAINT "project_print_settings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_print_settings" ADD CONSTRAINT "project_print_settings_default_contact_id_print_contacts_id_fk" FOREIGN KEY ("default_contact_id") REFERENCES "public"."print_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "print_contacts_email_uq" ON "print_contacts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "print_contacts_active_idx" ON "print_contacts" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "print_payments_project_idx" ON "print_payments" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "print_payments_run_idx" ON "print_payments" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "print_payments_status_idx" ON "print_payments" USING btree ("status","due_date");--> statement-breakpoint
CREATE INDEX "print_quotes_project_idx" ON "print_quotes" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "print_quotes_run_idx" ON "print_quotes" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "print_quotes_review_idx" ON "print_quotes" USING btree ("review_status");--> statement-breakpoint
CREATE INDEX "print_runs_project_idx" ON "print_runs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "print_runs_contact_idx" ON "print_runs" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "print_runs_status_idx" ON "print_runs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "print_thread_links_thread_uq" ON "print_thread_links" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "print_thread_links_project_idx" ON "print_thread_links" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "print_thread_links_contact_idx" ON "print_thread_links" USING btree ("contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_print_settings_project_uq" ON "project_print_settings" USING btree ("project_id");