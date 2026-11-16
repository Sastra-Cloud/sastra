CREATE TABLE "project_partner_quotations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"print_run_id" uuid,
	"title" text NOT NULL,
	"partner_id" uuid,
	"partner_name" text NOT NULL,
	"contact_name" text DEFAULT '' NOT NULL,
	"contact_email" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"currency" text NOT NULL,
	"lines" jsonb NOT NULL,
	"source_fingerprint" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "proposal_submissions" ADD COLUMN "partner_quotation_id" uuid;--> statement-breakpoint
ALTER TABLE "project_partner_quotations" ADD CONSTRAINT "project_partner_quotations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_partner_quotations" ADD CONSTRAINT "project_partner_quotations_print_run_id_print_runs_id_fk" FOREIGN KEY ("print_run_id") REFERENCES "public"."print_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_partner_quotations" ADD CONSTRAINT "project_partner_quotations_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_partner_quotations_scope_idx" ON "project_partner_quotations" USING btree ("project_id","print_run_id");--> statement-breakpoint
ALTER TABLE "proposal_submissions" ADD CONSTRAINT "proposal_submissions_partner_quotation_id_project_partner_quotations_id_fk" FOREIGN KEY ("partner_quotation_id") REFERENCES "public"."project_partner_quotations"("id") ON DELETE set null ON UPDATE no action;