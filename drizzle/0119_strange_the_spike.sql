CREATE TYPE "public"."file_purpose" AS ENUM('workspace_attachment', 'donation_import', 'system_generated', 'email_ingest');--> statement-breakpoint
CREATE TABLE "admin_assurance_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp NOT NULL,
	"consumed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_trusted_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"verified_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "passkey" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"public_key" text NOT NULL,
	"user_id" text NOT NULL,
	"credential_id" text NOT NULL,
	"counter" integer NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean NOT NULL,
	"transports" text,
	"created_at" timestamp DEFAULT now(),
	"aaguid" text
);
--> statement-breakpoint
CREATE TABLE "security_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text,
	"event" text NOT NULL,
	"method" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "donation_imports" DROP CONSTRAINT "donation_imports_file_id_files_id_fk";
--> statement-breakpoint
ALTER TABLE "donation_imports" ALTER COLUMN "file_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "donation_source_retention_days" integer;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "purpose" "file_purpose" DEFAULT 'workspace_attachment' NOT NULL;--> statement-breakpoint
ALTER TABLE "donation_imports" ADD COLUMN "source_retention_until" timestamp;--> statement-breakpoint
ALTER TABLE "donation_imports" ADD COLUMN "source_purged_at" timestamp;--> statement-breakpoint
ALTER TABLE "donation_imports" ADD COLUMN "source_purge_reason" text;--> statement-breakpoint
ALTER TABLE "donation_imports" ADD COLUMN "source_legal_hold" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_assurance_challenges" ADD CONSTRAINT "admin_assurance_challenges_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_trusted_devices" ADD CONSTRAINT "admin_trusted_devices_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passkey" ADD CONSTRAINT "passkey_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_assurance_challenges_user_idx" ON "admin_assurance_challenges" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_trusted_devices_token_uq" ON "admin_trusted_devices" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "admin_trusted_devices_user_idx" ON "admin_trusted_devices" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "passkey_credential_uq" ON "passkey" USING btree ("credential_id");--> statement-breakpoint
CREATE INDEX "passkey_user_idx" ON "passkey" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "security_events_actor_idx" ON "security_events" USING btree ("actor_id","created_at");--> statement-breakpoint
ALTER TABLE "donation_imports" ADD CONSTRAINT "donation_imports_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;