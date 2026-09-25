CREATE TABLE "email_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"project_id" uuid,
	"kind" text NOT NULL,
	"context_id" uuid NOT NULL,
	"to_addresses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cc_addresses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"baseline_subject" text,
	"baseline_body" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_drafts" ADD CONSTRAINT "email_drafts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_drafts" ADD CONSTRAINT "email_drafts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_drafts_user_kind_context_uq" ON "email_drafts" USING btree ("user_id","kind","context_id");--> statement-breakpoint
CREATE INDEX "email_drafts_project_user_idx" ON "email_drafts" USING btree ("project_id","user_id");