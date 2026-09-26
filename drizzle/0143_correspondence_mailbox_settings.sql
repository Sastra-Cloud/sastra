CREATE TABLE "correspondence_mailbox_settings" (
	"id" text PRIMARY KEY DEFAULT 'workspace' NOT NULL,
	"mailbox" text NOT NULL,
	"app_password_sealed" text NOT NULL,
	"verified_at" timestamp NOT NULL,
	"updated_by" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "correspondence_mailbox_settings" ADD CONSTRAINT "correspondence_mailbox_settings_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;